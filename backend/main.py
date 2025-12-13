"""FastAPI backend for tile labeling application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import router as config_router
from labels import router as labels_router
from export import router as export_router

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


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}

