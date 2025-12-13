"""Export functionality for labels and tiles."""

import asyncio
import json
from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from morecantile import Tile
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from config import load_config
from labels import load_labels
from tile_downloader import download_tiles_with_progress, get_tiles_in_bbox

router = APIRouter()

DATA_DIR = Path("./data")
TILES_DIR = DATA_DIR / "tiles"
GEOJSON_FILE = DATA_DIR / "labels.geojson"
COCO_FILE = DATA_DIR / "annotations.json"


class ExportRequest(BaseModel):
    """Request for tile image download."""

    tile_server_id: str
    include_unlabeled: bool = False


class DownloadRequest(BaseModel):
    """Request for downloading all tiles in labeling extent."""

    tile_server_id: str


# --- GeoJSON Export ---


@router.get("/geojson")
async def export_geojson():
    """Export labels as GeoJSON with tile indices."""
    gdf = load_labels()

    if len(gdf) == 0:
        geojson_data = {
            "type": "FeatureCollection",
            "features": [],
        }
    else:
        # Add tile info to properties
        features = []
        for _, row in gdf.iterrows():
            # Convert pixel_bbox to list if it's a numpy array or other type
            pixel_bbox = row["pixel_bbox"]
            if hasattr(pixel_bbox, 'tolist'):
                pixel_bbox = pixel_bbox.tolist()
            elif not isinstance(pixel_bbox, list):
                pixel_bbox = list(pixel_bbox)
            
            feature = {
                "type": "Feature",
                "geometry": row["geometry"].__geo_interface__,
                "properties": {
                    "id": str(row["id"]),
                    "tile_x": int(row["tile_x"]),
                    "tile_y": int(row["tile_y"]),
                    "tile_z": int(row["tile_z"]),
                    "pixel_bbox": pixel_bbox,
                    "noun_phrase": str(row["noun_phrase"]) if pd.notna(row["noun_phrase"]) and row["noun_phrase"] else None,
                    "is_negative": bool(row["is_negative"]),
                    "created_at": row["created_at"].isoformat(),
                },
            }
            features.append(feature)

        geojson_data = {
            "type": "FeatureCollection",
            "features": features,
        }

    # Persist to disk
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    GEOJSON_FILE.write_text(json.dumps(geojson_data, indent=2))

    return geojson_data


# --- COCO Export ---


@router.get("/coco")
async def export_coco(
    tile_server_id: Optional[str] = Query(None, description="Tile server to use for image paths"),
):
    """Export labels as COCO-format JSON."""
    gdf = load_labels()
    config = load_config()

    # Find tile server for tile size
    tile_size = 512
    if tile_server_id:
        for server in config.tile_servers:
            if server.id == tile_server_id:
                tile_size = server.tile_size
                break

    images = []
    annotations = []
    image_id_map = {}  # (z, x, y) -> image_id
    annotation_id = 1

    # Get unique tiles
    if len(gdf) > 0:
        unique_tiles = gdf[["tile_z", "tile_x", "tile_y"]].drop_duplicates()

        for i, (_, tile_row) in enumerate(unique_tiles.iterrows(), start=1):
            z, x, y = int(tile_row["tile_z"]), int(tile_row["tile_x"]), int(tile_row["tile_y"])
            image_id_map[(z, x, y)] = i

            images.append({
                "id": i,
                "file_name": f"tiles/{z}_{x}_{y}.png",
                "width": tile_size,
                "height": tile_size,
            })

        # Create annotations
        for _, row in gdf.iterrows():
            if row["is_negative"]:
                continue  # Skip negative examples for annotations

            z, x, y = int(row["tile_z"]), int(row["tile_x"]), int(row["tile_y"])
            image_id = image_id_map[(z, x, y)]
            
            # Convert pixel_bbox to list if it's a numpy array or other type
            pixel_bbox = row["pixel_bbox"]
            if hasattr(pixel_bbox, 'tolist'):
                pixel_bbox = pixel_bbox.tolist()
            elif not isinstance(pixel_bbox, list):
                pixel_bbox = list(pixel_bbox)
            
            # Ensure all values in pixel_bbox are Python native types
            pixel_bbox = [float(x) for x in pixel_bbox]

            # Create segmentation polygon from bbox
            bx, by, bw, bh = pixel_bbox
            segmentation = [[
                bx, by,
                bx + bw, by,
                bx + bw, by + bh,
                bx, by + bh,
            ]]

            annotations.append({
                "id": annotation_id,
                "image_id": image_id,
                "category_id": 1,
                "bbox": pixel_bbox,
                "segmentation": segmentation,
                "area": float(bw * bh),
                "iscrowd": 0,
                "noun_phrase": str(row["noun_phrase"]) if pd.notna(row["noun_phrase"]) and row["noun_phrase"] else "",
            })
            annotation_id += 1

    coco_data = {
        "info": {"description": "Tile labeling dataset"},
        "images": images,
        "annotations": annotations,
        "categories": [{"id": 1, "name": "object"}],
    }

    # Persist to disk
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    COCO_FILE.write_text(json.dumps(coco_data, indent=2))

    return coco_data


# --- Tile Download ---


@router.post("/download-tiles")
async def download_tiles(request: DownloadRequest):
    """Download tiles for the labeling extent with SSE progress."""
    config = load_config()

    # Find the tile server
    tile_server = None
    for server in config.tile_servers:
        if server.id == request.tile_server_id:
            tile_server = server
            break

    if tile_server is None:
        raise HTTPException(status_code=404, detail="Tile server not found")

    if config.labeling_extent is None:
        raise HTTPException(status_code=400, detail="Labeling extent not set")

    # Get tiles in the labeling extent at the labeling zoom level
    west, south, east, north = config.labeling_extent
    tiles = get_tiles_in_bbox(west, south, east, north, config.labeling_zoom)

    output_dir = TILES_DIR / tile_server.id

    async def generate_events():
        async for progress in download_tiles_with_progress(
            tiles=tiles,
            url_template=tile_server.url_template,
            output_dir=output_dir,
            max_concurrent=50,
            skip_existing=True,
        ):
            yield {
                "event": "progress",
                "data": json.dumps({
                    "total": progress.total,
                    "completed": progress.completed,
                    "failed": progress.failed,
                    "skipped": progress.skipped,
                    "current_tile": progress.current_tile,
                    "error": progress.error,
                }),
            }

        yield {
            "event": "complete",
            "data": json.dumps({"status": "done"}),
        }

    return EventSourceResponse(generate_events())


@router.get("/download-labeled-tiles")
async def download_labeled_tiles(tile_server_id: str):
    """Download only tiles that have labels with SSE progress."""
    config = load_config()
    gdf = load_labels()

    # Find the tile server
    tile_server = None
    for server in config.tile_servers:
        if server.id == tile_server_id:
            tile_server = server
            break

    if tile_server is None:
        raise HTTPException(status_code=404, detail="Tile server not found")

    if len(gdf) == 0:
        async def empty_events():
            yield {
                "event": "complete",
                "data": json.dumps({"status": "done", "message": "No labels to download"}),
            }
        return EventSourceResponse(empty_events())

    # Get unique labeled tiles
    unique_tiles = gdf[["tile_z", "tile_x", "tile_y"]].drop_duplicates()
    tiles = [
        Tile(x=int(row["tile_x"]), y=int(row["tile_y"]), z=int(row["tile_z"]))
        for _, row in unique_tiles.iterrows()
    ]

    output_dir = TILES_DIR / tile_server.id

    async def generate_events():
        async for progress in download_tiles_with_progress(
            tiles=tiles,
            url_template=tile_server.url_template,
            output_dir=output_dir,
            max_concurrent=50,
            skip_existing=True,
        ):
            yield {
                "event": "progress",
                "data": json.dumps({
                    "total": progress.total,
                    "completed": progress.completed,
                    "failed": progress.failed,
                    "skipped": progress.skipped,
                    "current_tile": progress.current_tile,
                    "error": progress.error,
                }),
            }

        yield {
            "event": "complete",
            "data": json.dumps({"status": "done"}),
        }

    return EventSourceResponse(generate_events())


# --- Data Directory Info ---


@router.get("/data-dir")
async def get_data_dir():
    """Get the data directory path."""
    return {"path": str(DATA_DIR.resolve())}


@router.post("/open-data-dir")
async def open_data_dir():
    """Open the data directory in the system file manager."""
    import platform
    import subprocess
    
    path = str(DATA_DIR.resolve())
    system = platform.system()
    
    try:
        if system == "Darwin":  # macOS
            subprocess.run(["open", path])
        elif system == "Windows":
            subprocess.run(["explorer", path])
        else:  # Linux
            subprocess.run(["xdg-open", path])
        return {"status": "opened"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open directory: {str(e)}")

