"""Optional TiTiler integration for serving local GeoTIFFs.

This module provides endpoints for:
1. Registering local GeoTIFF files by path
2. Serving tiles from GeoTIFFs via TiTiler
3. Getting GeoTIFF metadata (bounds, etc.)

To enable, install with: uv pip install -e ".[titiler]"
"""

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Registry file for tracking registered GeoTIFFs
DATA_DIR = Path(__file__).parent.parent / "data"
REGISTRY_FILE = DATA_DIR / "geotiff_registry.json"


def load_registry() -> dict[str, dict]:
    """Load the GeoTIFF registry from disk."""
    if REGISTRY_FILE.exists():
        return json.loads(REGISTRY_FILE.read_text())
    return {}


def save_registry(registry: dict[str, dict]):
    """Save the GeoTIFF registry to disk."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    REGISTRY_FILE.write_text(json.dumps(registry, indent=2))


# Check if TiTiler is available
try:
    from titiler.core.factory import TilerFactory
    import rasterio

    TITILER_AVAILABLE = True
except ImportError:
    TITILER_AVAILABLE = False
    TilerFactory = None
    rasterio = None


class GeoTiffInfo(BaseModel):
    """Information about a registered GeoTIFF."""

    id: str
    filename: str
    path: str
    tile_url_template: str
    bounds: list[float]  # [west, south, east, north]
    min_zoom: int
    max_zoom: int


class RegisterRequest(BaseModel):
    """Request to register a local GeoTIFF file."""

    path: str


class GeoTiffListResponse(BaseModel):
    """Response for listing GeoTIFFs."""

    geotiffs: list[GeoTiffInfo]
    titiler_available: bool


def get_geotiff_bounds(filepath: Path) -> tuple[list[float], int, int]:
    """Get bounds and recommended zoom levels from a GeoTIFF.

    Returns (bounds, min_zoom, max_zoom).
    """
    if not TITILER_AVAILABLE:
        return [-180.0, -85.0, 180.0, 85.0], 0, 22

    try:
        with rasterio.open(filepath) as src:
            from rasterio.warp import transform_bounds

            bounds = transform_bounds(src.crs, "EPSG:4326", *src.bounds)

            transform = src.transform
            pixel_size = abs(transform.a)
            pixel_size_meters = pixel_size * 111320

            import math

            if pixel_size_meters > 0:
                max_zoom = int(math.log2(156543 / pixel_size_meters))
                max_zoom = max(0, min(22, max_zoom))
            else:
                max_zoom = 18

            min_zoom = max(0, max_zoom - 8)

            return list(bounds), min_zoom, max_zoom
    except Exception:
        return [-180.0, -85.0, 180.0, 85.0], 0, 22


def create_titiler_router() -> APIRouter:
    """Create and configure the TiTiler router."""
    router = APIRouter()

    if TITILER_AVAILABLE:
        cog_tiler = TilerFactory(router_prefix="/cog")
        router.include_router(cog_tiler.router, prefix="/cog", tags=["COG Tiles"])

    @router.get("/status")
    async def titiler_status():
        """Check if TiTiler is available."""
        return {
            "available": TITILER_AVAILABLE,
            "message": (
                "TiTiler is ready"
                if TITILER_AVAILABLE
                else "TiTiler not installed. Run: uv pip install -e '.[titiler]'"
            ),
        }

    @router.post("/register", response_model=GeoTiffInfo)
    async def register_geotiff(request: RegisterRequest):
        """Register a local GeoTIFF file by path.

        The file is served directly from its location (not copied).
        """
        if not TITILER_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="TiTiler not installed. Run: uv pip install -e '.[titiler]'",
            )

        filepath = Path(request.path).expanduser().resolve()

        if not filepath.exists():
            raise HTTPException(status_code=400, detail=f"File not found: {filepath}")

        if not filepath.suffix.lower() in (".tif", ".tiff", ".geotiff"):
            raise HTTPException(
                status_code=400,
                detail="File must be a GeoTIFF (.tif, .tiff, or .geotiff)",
            )

        # Generate unique ID
        file_id = str(uuid.uuid4())[:8]

        # Get bounds and zoom levels
        bounds, min_zoom, max_zoom = get_geotiff_bounds(filepath)

        # Create tile URL template
        file_url = f"file://{filepath}"
        tile_url_template = (
            f"http://localhost:8000/titiler/cog/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}"
            f"?url={file_url}"
        )

        info = GeoTiffInfo(
            id=file_id,
            filename=filepath.name,
            path=str(filepath),
            tile_url_template=tile_url_template,
            bounds=bounds,
            min_zoom=min_zoom,
            max_zoom=max_zoom,
        )

        # Save to registry
        registry = load_registry()
        registry[file_id] = info.model_dump()
        save_registry(registry)

        return info

    @router.get("/geotiffs", response_model=GeoTiffListResponse)
    async def list_geotiffs():
        """List all registered GeoTIFFs."""
        registry = load_registry()

        geotiffs = []
        for file_id, data in registry.items():
            filepath = Path(data["path"])
            if filepath.exists():
                geotiffs.append(GeoTiffInfo(**data))

        return GeoTiffListResponse(
            geotiffs=geotiffs, titiler_available=TITILER_AVAILABLE
        )

    @router.delete("/geotiffs/{file_id}")
    async def delete_geotiff(file_id: str):
        """Unregister a GeoTIFF (does not delete the file)."""
        registry = load_registry()

        if file_id not in registry:
            raise HTTPException(status_code=404, detail="GeoTIFF not found")

        del registry[file_id]
        save_registry(registry)

        return {"deleted": file_id}

    @router.get("/geotiffs/{file_id}/info")
    async def get_geotiff_info(file_id: str):
        """Get detailed information about a GeoTIFF."""
        if not TITILER_AVAILABLE:
            raise HTTPException(status_code=503, detail="TiTiler not installed")

        registry = load_registry()

        if file_id not in registry:
            raise HTTPException(status_code=404, detail="GeoTIFF not found")

        filepath = Path(registry[file_id]["path"])
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File no longer exists")

        try:
            with rasterio.open(filepath) as src:
                return {
                    "id": file_id,
                    "filename": filepath.name,
                    "crs": str(src.crs),
                    "bounds": list(src.bounds),
                    "width": src.width,
                    "height": src.height,
                    "count": src.count,
                    "dtypes": [str(d) for d in src.dtypes],
                }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read GeoTIFF: {e}")

    return router
