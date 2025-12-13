"""Labels management with GeoParquet persistence."""

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from shapely.geometry import box

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent / "data"
LABELS_FILE = DATA_DIR / "labels.geoparquet"


class LabelCreate(BaseModel):
    """Label creation request."""

    tile_x: int
    tile_y: int
    tile_z: int
    pixel_bbox: list[float]  # [x, y, width, height] in pixel coords
    noun_phrase: Optional[str] = None
    is_negative: bool = False
    # Geographic bounds for the geometry
    geo_bounds: list[float]  # [west, south, east, north]


class LabelUpdate(BaseModel):
    """Label update request."""

    pixel_bbox: Optional[list[float]] = None
    noun_phrase: Optional[str] = None
    is_negative: Optional[bool] = None
    geo_bounds: Optional[list[float]] = None


class Label(BaseModel):
    """Label response model."""

    id: str
    tile_x: int
    tile_y: int
    tile_z: int
    pixel_bbox: list[float]
    noun_phrase: Optional[str]
    is_negative: bool
    geo_bounds: list[float]
    created_at: datetime


def ensure_data_dir():
    """Ensure data directory exists."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_labels() -> gpd.GeoDataFrame:
    """Load labels from GeoParquet or return empty GeoDataFrame."""
    ensure_data_dir()
    if LABELS_FILE.exists():
        try:
            return gpd.read_parquet(LABELS_FILE)
        except Exception:
            pass
    # Return empty GeoDataFrame with correct schema
    return gpd.GeoDataFrame(
        {
            "id": pd.Series(dtype="str"),
            "tile_x": pd.Series(dtype="int64"),
            "tile_y": pd.Series(dtype="int64"),
            "tile_z": pd.Series(dtype="int64"),
            "pixel_bbox": pd.Series(dtype="object"),
            "noun_phrase": pd.Series(dtype="str"),
            "is_negative": pd.Series(dtype="bool"),
            "geo_bounds": pd.Series(dtype="object"),
            "created_at": pd.Series(dtype="datetime64[ns, UTC]"),
        },
        geometry=gpd.GeoSeries([], crs="EPSG:4326"),
    )


def save_labels(gdf: gpd.GeoDataFrame):
    """Save labels to GeoParquet."""
    ensure_data_dir()
    if len(gdf) == 0:
        # Delete file if empty
        if LABELS_FILE.exists():
            LABELS_FILE.unlink()
        return
    gdf.to_parquet(LABELS_FILE)


def gdf_to_labels(gdf: gpd.GeoDataFrame) -> list[Label]:
    """Convert GeoDataFrame to list of Label models."""
    labels = []
    for _, row in gdf.iterrows():
        labels.append(
            Label(
                id=row["id"],
                tile_x=int(row["tile_x"]),
                tile_y=int(row["tile_y"]),
                tile_z=int(row["tile_z"]),
                pixel_bbox=row["pixel_bbox"],
                noun_phrase=row["noun_phrase"] if pd.notna(row["noun_phrase"]) else None,
                is_negative=bool(row["is_negative"]),
                geo_bounds=row["geo_bounds"],
                created_at=row["created_at"],
            )
        )
    return labels


# --- API Endpoints ---


@router.get("", response_model=list[Label])
async def get_labels():
    """Get all labels."""
    gdf = load_labels()
    return gdf_to_labels(gdf)


@router.get("/tile/{z}/{x}/{y}", response_model=list[Label])
async def get_labels_for_tile(z: int, x: int, y: int):
    """Get labels for a specific tile."""
    gdf = load_labels()
    if len(gdf) == 0:
        return []
    mask = (gdf["tile_x"] == x) & (gdf["tile_y"] == y) & (gdf["tile_z"] == z)
    return gdf_to_labels(gdf[mask])


@router.post("", response_model=Label)
async def create_label(label: LabelCreate):
    """Create a new label."""
    gdf = load_labels()

    label_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Create geometry from geo_bounds
    geometry = box(*label.geo_bounds)

    new_row = gpd.GeoDataFrame(
        {
            "id": [label_id],
            "tile_x": [label.tile_x],
            "tile_y": [label.tile_y],
            "tile_z": [label.tile_z],
            "pixel_bbox": [label.pixel_bbox],
            "noun_phrase": [label.noun_phrase],
            "is_negative": [label.is_negative],
            "geo_bounds": [label.geo_bounds],
            "created_at": [now],
        },
        geometry=[geometry],
        crs="EPSG:4326",
    )

    gdf = pd.concat([gdf, new_row], ignore_index=True)
    gdf = gpd.GeoDataFrame(gdf, geometry="geometry", crs="EPSG:4326")
    save_labels(gdf)

    return Label(
        id=label_id,
        tile_x=label.tile_x,
        tile_y=label.tile_y,
        tile_z=label.tile_z,
        pixel_bbox=label.pixel_bbox,
        noun_phrase=label.noun_phrase,
        is_negative=label.is_negative,
        geo_bounds=label.geo_bounds,
        created_at=now,
    )


@router.put("/{label_id}", response_model=Label)
async def update_label(label_id: str, update: LabelUpdate):
    """Update an existing label."""
    gdf = load_labels()

    if len(gdf) == 0 or label_id not in gdf["id"].values:
        raise HTTPException(status_code=404, detail="Label not found")

    idx = gdf[gdf["id"] == label_id].index[0]

    if update.pixel_bbox is not None:
        gdf.at[idx, "pixel_bbox"] = update.pixel_bbox
    if update.noun_phrase is not None:
        gdf.at[idx, "noun_phrase"] = update.noun_phrase
    if update.is_negative is not None:
        gdf.at[idx, "is_negative"] = update.is_negative
    if update.geo_bounds is not None:
        gdf.at[idx, "geo_bounds"] = update.geo_bounds
        gdf.at[idx, "geometry"] = box(*update.geo_bounds)

    save_labels(gdf)

    row = gdf.loc[idx]
    return Label(
        id=row["id"],
        tile_x=int(row["tile_x"]),
        tile_y=int(row["tile_y"]),
        tile_z=int(row["tile_z"]),
        pixel_bbox=row["pixel_bbox"],
        noun_phrase=row["noun_phrase"] if pd.notna(row["noun_phrase"]) else None,
        is_negative=bool(row["is_negative"]),
        geo_bounds=row["geo_bounds"],
        created_at=row["created_at"],
    )


@router.delete("/{label_id}")
async def delete_label(label_id: str):
    """Delete a label."""
    gdf = load_labels()

    if len(gdf) == 0 or label_id not in gdf["id"].values:
        raise HTTPException(status_code=404, detail="Label not found")

    gdf = gdf[gdf["id"] != label_id]
    gdf = gpd.GeoDataFrame(gdf, geometry="geometry", crs="EPSG:4326")
    save_labels(gdf)

    return {"deleted": label_id}


@router.delete("/tile/{z}/{x}/{y}")
async def delete_labels_for_tile(z: int, x: int, y: int):
    """Delete all labels for a specific tile."""
    gdf = load_labels()

    if len(gdf) == 0:
        return {"deleted": 0}

    mask = (gdf["tile_x"] == x) & (gdf["tile_y"] == y) & (gdf["tile_z"] == z)
    deleted_count = mask.sum()

    gdf = gdf[~mask]
    gdf = gpd.GeoDataFrame(gdf, geometry="geometry", crs="EPSG:4326")
    save_labels(gdf)

    return {"deleted": int(deleted_count)}

