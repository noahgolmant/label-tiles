"""FastAPI backend for tile labeling application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import router as config_router
from labels import router as labels_router
from export import router as export_router
from titiler_router import create_titiler_router, TITILER_AVAILABLE

app = FastAPI(title="Tile Labeling API", version="0.1.0")

# CORS for frontend (allow any localhost port in development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router, prefix="/api/config", tags=["config"])
app.include_router(labels_router, prefix="/api/labels", tags=["labels"])
app.include_router(export_router, prefix="/api/export", tags=["export"])

# Mount TiTiler router (works even if titiler is not installed - shows status)
titiler_router = create_titiler_router()
app.include_router(titiler_router, prefix="/titiler", tags=["titiler"])

# Add TiTiler exception handlers if available
if TITILER_AVAILABLE:
    from titiler.core.errors import DEFAULT_STATUS_CODES, add_exception_handlers

    add_exception_handlers(app, DEFAULT_STATUS_CODES)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "titiler_available": TITILER_AVAILABLE}

