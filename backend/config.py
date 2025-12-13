"""Config management for tile servers, noun phrases, and UI state."""

import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

DATA_DIR = Path("./data")
CONFIG_FILE = DATA_DIR / "config.json"
UI_STATE_FILE = DATA_DIR / "ui_state.json"


class TileServer(BaseModel):
    """Tile server configuration."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url_template: str
    bounds: list[float] = Field(default=[-180.0, -85.0, 180.0, 85.0])
    min_zoom: int = 0
    max_zoom: int = 22
    tile_size: int = 512


class Config(BaseModel):
    """Application configuration."""

    tile_servers: list[TileServer] = Field(default_factory=list)
    labeling_zoom: int = 18
    noun_phrases: list[str] = Field(
        default_factory=lambda: ["building", "road", "tree", "vehicle"]
    )
    labeling_extent: Optional[list[float]] = None


class Viewport(BaseModel):
    """Map viewport state."""

    latitude: float = 37.75
    longitude: float = -122.4
    zoom: float = 14
    bearing: float = 0
    pitch: float = 0


class UIState(BaseModel):
    """UI state for persistence."""

    viewport: Viewport = Field(default_factory=Viewport)
    active_layers: list[str] = Field(default_factory=list)
    selected_tile: Optional[dict] = None


def ensure_data_dir():
    """Ensure data directory exists."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_config() -> Config:
    """Load config from file or return default."""
    ensure_data_dir()
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text())
            return Config(**data)
        except (json.JSONDecodeError, ValueError):
            return Config()
    return Config()


def save_config(config: Config):
    """Save config to file."""
    ensure_data_dir()
    CONFIG_FILE.write_text(config.model_dump_json(indent=2))


def load_ui_state() -> UIState:
    """Load UI state from file or return default."""
    ensure_data_dir()
    if UI_STATE_FILE.exists():
        try:
            data = json.loads(UI_STATE_FILE.read_text())
            return UIState(**data)
        except (json.JSONDecodeError, ValueError):
            return UIState()
    return UIState()


def save_ui_state(state: UIState):
    """Save UI state to file."""
    ensure_data_dir()
    UI_STATE_FILE.write_text(state.model_dump_json(indent=2))


# --- API Endpoints ---


@router.get("", response_model=Config)
async def get_config():
    """Get current configuration."""
    return load_config()


@router.put("", response_model=Config)
async def update_config(config: Config):
    """Update entire configuration."""
    save_config(config)
    return config


@router.post("/tile-servers", response_model=TileServer)
async def add_tile_server(server: TileServer):
    """Add a new tile server."""
    config = load_config()
    if not server.id:
        server.id = str(uuid.uuid4())
    config.tile_servers.append(server)
    save_config(config)
    return server


@router.put("/tile-servers/{server_id}", response_model=TileServer)
async def update_tile_server(server_id: str, server: TileServer):
    """Update an existing tile server."""
    config = load_config()
    for i, s in enumerate(config.tile_servers):
        if s.id == server_id:
            server.id = server_id
            config.tile_servers[i] = server
            save_config(config)
            return server
    raise HTTPException(status_code=404, detail="Tile server not found")


@router.delete("/tile-servers/{server_id}")
async def delete_tile_server(server_id: str):
    """Delete a tile server."""
    config = load_config()
    original_len = len(config.tile_servers)
    config.tile_servers = [s for s in config.tile_servers if s.id != server_id]
    if len(config.tile_servers) == original_len:
        raise HTTPException(status_code=404, detail="Tile server not found")
    save_config(config)
    return {"deleted": server_id}


@router.put("/noun-phrases", response_model=list[str])
async def update_noun_phrases(phrases: list[str]):
    """Update noun phrases list."""
    config = load_config()
    config.noun_phrases = phrases
    save_config(config)
    return phrases


@router.put("/labeling-zoom", response_model=int)
async def update_labeling_zoom(zoom: int):
    """Update labeling zoom level."""
    config = load_config()
    config.labeling_zoom = zoom
    save_config(config)
    return zoom


@router.put("/labeling-extent")
async def update_labeling_extent(extent: Optional[list[float]]):
    """Update labeling extent."""
    config = load_config()
    config.labeling_extent = extent
    save_config(config)
    return extent


# --- UI State Endpoints ---


@router.get("/ui-state", response_model=UIState)
async def get_ui_state():
    """Get current UI state."""
    return load_ui_state()


@router.put("/ui-state", response_model=UIState)
async def update_ui_state(state: UIState):
    """Update UI state."""
    save_ui_state(state)
    return state

