#!/usr/bin/env python3
"""
Sliding window post-processing script for generating additional training data.

This script creates new tile images by sliding a window over the original tiles
and generates corresponding COCO annotations with translated bounding boxes.

Usage:
    uv run backend/sliding_window.py --stride 256
    uv run backend/sliding_window.py --stride 128 --tile-server-id my-server
"""

import argparse
import json
import shutil
from pathlib import Path
from typing import Optional

from PIL import Image

DATA_DIR = Path(__file__).parent.parent / "data"
TILES_DIR = DATA_DIR / "tiles"
COCO_FILE = DATA_DIR / "annotations.json"


def find_tiles_directory(tile_server_id: Optional[str] = None) -> Optional[Path]:
    """Find the tiles directory (may be nested under tile_server_id)."""
    if not TILES_DIR.exists():
        return None

    if tile_server_id:
        server_dir = TILES_DIR / tile_server_id
        if server_dir.exists():
            return server_dir

    # Check if tiles are directly in tiles/ or nested under a tile_server_id
    subdirs = [d for d in TILES_DIR.iterdir() if d.is_dir()]
    if len(subdirs) == 1:
        return subdirs[0]
    elif len(subdirs) == 0:
        return TILES_DIR
    else:
        # Multiple subdirs - use the first one
        return subdirs[0]


def load_coco_annotations(coco_file: Path = COCO_FILE) -> dict:
    """Load COCO format annotations from JSON file."""
    if not coco_file.exists():
        raise FileNotFoundError(f"COCO annotations file not found: {coco_file}")

    with open(coco_file, "r") as f:
        return json.load(f)


def parse_tile_filename(filename: str) -> tuple[int, int, int]:
    """Parse z_x_y from tile filename."""
    # Remove extension and parse
    stem = Path(filename).stem
    parts = stem.split("_")
    if len(parts) >= 3:
        return int(parts[0]), int(parts[1]), int(parts[2])
    raise ValueError(f"Cannot parse tile filename: {filename}")


def generate_window_offsets(tile_size: int, stride: int) -> list[tuple[int, int]]:
    """
    Generate window offsets for sliding window.
    
    Returns list of (offset_x, offset_y) tuples, excluding (0, 0) which is the original.
    """
    offsets = []
    for oy in range(0, tile_size, stride):
        for ox in range(0, tile_size, stride):
            if ox == 0 and oy == 0:
                continue  # Skip original position
            offsets.append((ox, oy))
    return offsets


def get_required_tiles(z: int, x: int, y: int, offset_x: int, offset_y: int, tile_size: int) -> list[tuple[int, int, int, int, int, int, int]]:
    """
    Determine which tiles are needed to construct a window at the given offset.
    
    Returns list of (z, x, y, src_x, src_y, dst_x, dst_y) where:
    - (z, x, y) is the tile coordinate
    - (src_x, src_y) is the top-left corner to copy from in the source tile
    - (dst_x, dst_y) is the top-left corner to paste to in the destination window
    """
    tiles_needed = []
    
    # The window starts at (offset_x, offset_y) in the original tile's coordinate space
    # and extends tile_size pixels in each direction
    
    # Calculate how much of each neighboring tile we need
    # Right portion of original tile
    right_in_original = tile_size - offset_x
    # Bottom portion of original tile
    bottom_in_original = tile_size - offset_y
    
    # Original tile (top-left of window)
    if right_in_original > 0 and bottom_in_original > 0:
        tiles_needed.append((z, x, y, offset_x, offset_y, 0, 0))
    
    # Right neighbor (top-right of window)
    if offset_x > 0 and bottom_in_original > 0:
        tiles_needed.append((z, x + 1, y, 0, offset_y, right_in_original, 0))
    
    # Bottom neighbor (bottom-left of window)
    if offset_y > 0 and right_in_original > 0:
        tiles_needed.append((z, x, y + 1, offset_x, 0, 0, bottom_in_original))
    
    # Bottom-right neighbor (bottom-right of window)
    if offset_x > 0 and offset_y > 0:
        tiles_needed.append((z, x + 1, y + 1, 0, 0, right_in_original, bottom_in_original))
    
    return tiles_needed


def translate_and_clip_bbox(
    bbox: list[float],
    offset_x: int,
    offset_y: int,
    tile_size: int,
) -> Optional[list[float]]:
    """
    Translate bbox to window coords and clip to bounds.
    
    Args:
        bbox: [x, y, width, height] in original tile coordinates
        offset_x: Window offset from original tile left edge
        offset_y: Window offset from original tile top edge
        tile_size: Size of the window (same as tile size)
    
    Returns:
        Translated and clipped bbox [x, y, width, height] or None if outside window
    """
    bx, by, bw, bh = bbox
    
    # Translate to window coordinates
    new_x = bx - offset_x
    new_y = by - offset_y
    
    # Clip to window bounds [0, tile_size]
    x1 = max(0, new_x)
    y1 = max(0, new_y)
    x2 = min(tile_size, new_x + bw)
    y2 = min(tile_size, new_y + bh)
    
    # Check if bbox is still valid after clipping
    if x2 <= x1 or y2 <= y1:
        return None  # Bbox completely outside window
    
    return [x1, y1, x2 - x1, y2 - y1]


def create_window_image(
    tiles_dir: Path,
    z: int,
    x: int,
    y: int,
    offset_x: int,
    offset_y: int,
    tile_size: int,
) -> Optional[Image.Image]:
    """
    Create a window image by compositing from required tiles.
    
    The window starts at (offset_x, offset_y) in the original tile and
    extends tile_size pixels, potentially spanning into neighboring tiles.
    
    Returns None if any required tile is missing.
    """
    # Initialize output image
    window = Image.new("RGB", (tile_size, tile_size))
    
    # Define the 4 possible contributing chunks:
    # (tile_x, tile_y, crop_box, paste_position)
    # crop_box is (left, top, right, bottom) in source tile coordinates
    chunks = [
        # Top-left: from original tile
        (x, y,
         (offset_x, offset_y, tile_size, tile_size),
         (0, 0)),
        # Top-right: from right neighbor
        (x + 1, y,
         (0, offset_y, offset_x, tile_size),
         (tile_size - offset_x, 0)),
        # Bottom-left: from bottom neighbor
        (x, y + 1,
         (offset_x, 0, tile_size, offset_y),
         (0, tile_size - offset_y)),
        # Bottom-right: from diagonal neighbor
        (x + 1, y + 1,
         (0, 0, offset_x, offset_y),
         (tile_size - offset_x, tile_size - offset_y)),
    ]
    
    for tx, ty, crop_box, paste_pos in chunks:
        left, top, right, bottom = crop_box
        
        # Skip chunks with zero width or height
        if right <= left or bottom <= top:
            continue
        
        tile_path = tiles_dir / f"{z}_{tx}_{ty}.png"
        if not tile_path.exists():
            return None  # Missing required tile
        
        try:
            tile_img = Image.open(tile_path).convert("RGB")
        except Exception:
            return None
        
        # Crop from source tile and paste into window
        region = tile_img.crop(crop_box)
        window.paste(region, paste_pos)
    
    return window


def process_sliding_windows(
    stride: int,
    tile_server_id: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> None:
    """
    Main processing function to generate sliding window tiles and annotations.
    
    Outputs a complete training dataset including:
    - Original labeled tiles (copied to output directory)
    - Sliding window tiles (composited from neighboring tiles)
    - Combined COCO annotations for all images
    """
    # Find tiles directory
    tiles_dir = find_tiles_directory(tile_server_id)
    if tiles_dir is None:
        raise ValueError(f"Tiles directory not found at {TILES_DIR}")
    
    print(f"Using tiles directory: {tiles_dir}")
    
    # Load COCO annotations
    coco_data = load_coco_annotations()
    
    if not coco_data["images"]:
        print("No images in COCO annotations")
        return
    
    # Get tile size from first image
    tile_size = coco_data["images"][0]["width"]
    print(f"Tile size: {tile_size}x{tile_size}")
    print(f"Stride: {stride}")
    
    # Generate window offsets
    offsets = generate_window_offsets(tile_size, stride)
    print(f"Window offsets to generate: {len(offsets)}")
    
    # Setup output directory
    if output_dir is None:
        output_dir = DATA_DIR / "sliding_windows"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Build image_id -> image mapping
    images_by_id = {img["id"]: img for img in coco_data["images"]}
    
    # Build set of available tile coordinates from labeled images
    # This ensures we only create windows where ALL required tiles have labels
    available_tiles: set[tuple[int, int, int]] = set()
    tile_to_image_id: dict[tuple[int, int, int], int] = {}
    for img in coco_data["images"]:
        try:
            basename = Path(img["file_name"]).name
            z, x, y = parse_tile_filename(basename)
            available_tiles.add((z, x, y))
            tile_to_image_id[(z, x, y)] = img["id"]
        except ValueError:
            pass
    
    print(f"Available labeled tiles: {len(available_tiles)}")
    
    # Build image_id -> annotations mapping
    annotations_by_image = {}
    for ann in coco_data["annotations"]:
        image_id = ann["image_id"]
        if image_id not in annotations_by_image:
            annotations_by_image[image_id] = []
        annotations_by_image[image_id].append(ann)
    
    # New COCO data structure
    new_images = []
    new_annotations = []
    new_image_id = 1
    new_annotation_id = 1
    
    # Track statistics
    originals_copied = 0
    windows_created = 0
    windows_skipped = 0
    annotations_created = 0
    
    # First, copy all original tiles and their annotations
    print("\nCopying original tiles...")
    for orig_image in coco_data["images"]:
        orig_image_id = orig_image["id"]
        filename = orig_image["file_name"]
        basename = Path(filename).name
        
        # Copy original tile to output
        src_path = tiles_dir / basename
        dst_path = output_dir / basename
        
        if src_path.exists():
            shutil.copy2(src_path, dst_path)
            originals_copied += 1
            
            # Add to new images list
            new_images.append({
                "id": new_image_id,
                "file_name": basename,
                "width": orig_image["width"],
                "height": orig_image["height"],
            })
            
            # Copy annotations for this original tile
            for orig_ann in annotations_by_image.get(orig_image_id, []):
                bx, by, bw, bh = orig_ann["bbox"]
                segmentation = orig_ann.get("segmentation", [[
                    bx, by,
                    bx + bw, by,
                    bx + bw, by + bh,
                    bx, by + bh,
                ]])
                
                new_annotations.append({
                    "id": new_annotation_id,
                    "image_id": new_image_id,
                    "category_id": orig_ann["category_id"],
                    "bbox": orig_ann["bbox"],
                    "segmentation": segmentation,
                    "area": orig_ann.get("area", float(bw * bh)),
                    "iscrowd": orig_ann.get("iscrowd", 0),
                    "noun_phrase": orig_ann.get("noun_phrase", ""),
                })
                new_annotation_id += 1
                annotations_created += 1
            
            new_image_id += 1
        else:
            print(f"  Warning: Original tile not found: {src_path}")
    
    # Now generate sliding window tiles
    print("\nGenerating sliding window tiles...")
    for orig_image in coco_data["images"]:
        orig_image_id = orig_image["id"]
        filename = orig_image["file_name"]
        
        # Parse tile coordinates
        try:
            basename = Path(filename).name
            z, x, y = parse_tile_filename(basename)
        except ValueError as e:
            print(f"Warning: {e}")
            continue
        
        # Generate windows for each offset
        for offset_x, offset_y in offsets:
            
            # Get required tiles info for annotation collection
            required_tiles = get_required_tiles(z, x, y, offset_x, offset_y, tile_size)
            
            # Collect annotations from labeled tiles that contribute to this window
            # We do this BEFORE creating the image to check if any annotations are visible
            window_annotations = []
            temp_annotation_id = new_annotation_id
            
            for tz, tx, ty, src_x, src_y, dst_x, dst_y in required_tiles:
                tile_image_id = tile_to_image_id.get((tz, tx, ty))
                if tile_image_id is None:
                    continue
                
                tile_annotations = annotations_by_image.get(tile_image_id, [])
                
                for ann in tile_annotations:
                    # Calculate offset for this tile's annotations in window coords
                    # The tile's (0,0) maps to (dst_x - src_x, dst_y - src_y) in window coords
                    tile_offset_x = src_x - dst_x
                    tile_offset_y = src_y - dst_y
                    
                    new_bbox = translate_and_clip_bbox(
                        ann["bbox"],
                        tile_offset_x,
                        tile_offset_y,
                        tile_size,
                    )
                    
                    if new_bbox is None:
                        continue  # Annotation outside window
                    
                    # Create segmentation polygon from clipped bbox
                    bx, by, bw, bh = new_bbox
                    segmentation = [[
                        bx, by,
                        bx + bw, by,
                        bx + bw, by + bh,
                        bx, by + bh,
                    ]]
                    
                    window_annotations.append({
                        "id": temp_annotation_id,
                        "image_id": new_image_id,
                        "category_id": ann["category_id"],
                        "bbox": new_bbox,
                        "segmentation": segmentation,
                        "area": float(bw * bh),
                        "iscrowd": 0,
                        "noun_phrase": ann.get("noun_phrase", ""),
                    })
                    temp_annotation_id += 1
            
            # Skip windows that don't intersect any annotations from labeled tiles
            if not window_annotations:
                windows_skipped += 1
                continue
            
            # Now create the window image (checks that tiles exist on disk)
            window_img = create_window_image(
                tiles_dir, z, x, y, offset_x, offset_y, tile_size
            )
            
            if window_img is None:
                windows_skipped += 1
                continue
            
            # Generate filename for window
            window_filename = f"{z}_{x}_{y}_w{offset_x}_{offset_y}.png"
            window_path = output_dir / window_filename
            
            # Save window image
            window_img.save(window_path)
            windows_created += 1
            
            # Add to new images list
            new_images.append({
                "id": new_image_id,
                "file_name": window_filename,
                "width": tile_size,
                "height": tile_size,
            })
            
            # Finalize annotation IDs and add to list
            new_annotation_id = temp_annotation_id
            annotations_created += len(window_annotations)
            new_annotations.extend(window_annotations)
            new_image_id += 1
    
    # Create new COCO JSON
    new_coco_data = {
        "info": {
            "description": f"Sliding window dataset (stride={stride})",
            "original_dataset": str(COCO_FILE),
        },
        "images": new_images,
        "annotations": new_annotations,
        "categories": coco_data["categories"],
    }
    
    # Save new COCO JSON
    output_coco_path = output_dir / "annotations.json"
    with open(output_coco_path, "w") as f:
        json.dump(new_coco_data, f, indent=2)
    
    print(f"\nResults:")
    print(f"  Original tiles copied: {originals_copied}")
    print(f"  Sliding windows created: {windows_created}")
    print(f"  Sliding windows skipped (no visible annotations or missing tiles): {windows_skipped}")
    print(f"  Total images: {len(new_images)}")
    print(f"  Total annotations: {annotations_created}")
    print(f"\nOutput directory: {output_dir}")
    print(f"COCO annotations: {output_coco_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate sliding window training data from labeled tiles"
    )
    parser.add_argument(
        "--stride",
        type=int,
        required=True,
        help="Stride in pixels for sliding window (e.g., 128for 50%% overlap with 256px tiles)",
    )
    parser.add_argument(
        "--tile-server-id",
        type=str,
        default=None,
        help="Tile server ID (subdirectory name in data/tiles/)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory (defaults to data/sliding_windows)",
    )
    
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir) if args.output_dir else None
    
    process_sliding_windows(
        stride=args.stride,
        tile_server_id=args.tile_server_id,
        output_dir=output_dir,
    )


if __name__ == "__main__":
    main()
