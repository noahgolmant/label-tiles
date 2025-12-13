"""Async tile downloader with progress tracking."""

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator

import aiohttp
from morecantile import Tile, tms


@dataclass
class DownloadProgress:
    """Progress update for tile downloads."""

    total: int
    completed: int
    failed: int
    skipped: int
    current_tile: str | None = None
    error: str | None = None


@dataclass
class TileDownloadResult:
    """Result of a single tile download."""

    tile: Tile
    success: bool
    filepath: str | None = None
    error: str | None = None
    skipped: bool = False


def get_tiles_in_bbox(
    west: float, south: float, east: float, north: float, zoom: int
) -> list[Tile]:
    """Get all tiles at given zoom level within bounding box."""
    web_mercator = tms.get("WebMercatorQuad")
    tiles = list(web_mercator.tiles(west, south, east, north, zooms=[zoom]))
    return tiles


def tile_to_bounds(tile: Tile) -> tuple[float, float, float, float]:
    """Get the geographic bounds of a tile."""
    web_mercator = tms.get("WebMercatorQuad")
    bounds = web_mercator.bounds(tile)
    return (bounds.left, bounds.bottom, bounds.right, bounds.top)


async def download_single_tile(
    session: aiohttp.ClientSession,
    tile: Tile,
    url_template: str,
    output_dir: Path,
    semaphore: asyncio.Semaphore,
    skip_existing: bool = True,
) -> TileDownloadResult:
    """Download a single tile."""
    filename = f"{tile.z}_{tile.x}_{tile.y}.png"
    filepath = output_dir / filename

    # Skip if already exists
    if skip_existing and filepath.exists():
        return TileDownloadResult(
            tile=tile,
            success=True,
            filepath=str(filepath),
            skipped=True,
        )

    url = url_template.format(z=tile.z, x=tile.x, y=tile.y)

    async with semaphore:
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    content = await response.read()
                    filepath.write_bytes(content)
                    return TileDownloadResult(
                        tile=tile,
                        success=True,
                        filepath=str(filepath),
                    )
                else:
                    return TileDownloadResult(
                        tile=tile,
                        success=False,
                        error=f"HTTP {response.status}",
                    )
        except Exception as e:
            return TileDownloadResult(
                tile=tile,
                success=False,
                error=str(e),
            )


async def download_tiles_with_progress(
    tiles: list[Tile],
    url_template: str,
    output_dir: Path,
    max_concurrent: int = 50,
    skip_existing: bool = True,
) -> AsyncGenerator[DownloadProgress, None]:
    """Download tiles with progress updates via async generator."""
    output_dir.mkdir(parents=True, exist_ok=True)

    semaphore = asyncio.Semaphore(max_concurrent)
    connector = aiohttp.TCPConnector(limit=max_concurrent)
    timeout = aiohttp.ClientTimeout(total=60)

    total = len(tiles)
    completed = 0
    failed = 0
    skipped = 0

    # Initial progress
    yield DownloadProgress(
        total=total,
        completed=0,
        failed=0,
        skipped=0,
    )

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        # Create tasks for all tiles
        tasks = []
        for tile in tiles:
            task = asyncio.create_task(
                download_single_tile(
                    session, tile, url_template, output_dir, semaphore, skip_existing
                )
            )
            tasks.append(task)

        # Process as they complete
        for coro in asyncio.as_completed(tasks):
            result = await coro
            completed += 1
            if not result.success:
                failed += 1
            elif result.skipped:
                skipped += 1

            yield DownloadProgress(
                total=total,
                completed=completed,
                failed=failed,
                skipped=skipped,
                current_tile=f"{result.tile.z}/{result.tile.x}/{result.tile.y}",
                error=result.error,
            )

