# AnnoTile: Label large-scale geospatial datasets with tile servers

AnnoTile is a tool to label bounding boxes for geospatial datasets. Any dataset that can be served via an XYZ tile server can be labeled.

You can draw bounding boxes on mercantile tiles and export labels as GeoJSON or COCO JSON annotation format. You can also download the underlying tile images for ML training and inference. This is built with React + FastAPI + MapLibre. Exported data is compatible with standard computer vision tools and ML tools like `pytorch` and `ultralytics`.

## Features

- Configure multiple tile server URLs with custom bounds, zoom levels, and tile sizes
- Draw bounding boxes within tiles
- Hotkey-driven label assignment for custom categories or negative examples
- Persist labels to GeoParquet, GeoJSON, or COCO JSON for ML training
- Download tiles over bounding boxes to build training datasets

## Prerequisites

- Python 3.12+ with [uv](https://github.com/astral-sh/uv)
- Node.js 20+

![AnnoTile Demo](assets/annotile-demo.gif)

## Setup

### Backend

```bash
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at http://localhost:5173 and the backend API at http://localhost:8000.

## Usage

### 1. Configure Tile Servers

Click **Config** to add tile servers. Each server needs:

- **Name**: Display name
- **URL template**: Tile URL with `{z}/{x}/{y}` placeholders
- **Tile size**: 512 (default) or 256 for OSM

Example URL: `https://tile.server.com/tiles/{z}/{x}/{y}.png`

### 2. Set Labeling Parameters

In the Config panel:

- Set the **labeling zoom level** (tiles will be shown at this zoom)
- Set the **labeling extent** (optional, for download scope)
- Add/remove **label categories** (accessible via hotkeys 1-9)

### 3. Enable Layers

Use the **Layers** panel (top-left on map) to toggle tile server visibility.

### 4. Draw Bounding Boxes

1. Click and drag on the map to draw a bounding box
2. Press a number key (1-9) to assign a label category
3. Press **N** to mark the tile as having no objects (negative example)
4. Press **Esc** to cancel

### 5. Manage Labels

The sidebar shows all labels grouped by tile. Click to select, click × to delete.

Hotkeys:

- **1-9**: Assign label (after drawing bbox)
- **N**: Mark tile as negative
- **D**: Delete selected label
- **Esc**: Cancel drawing

### 6. Export

Click **Export** to:

- **Export GeoJSON**: Download labels with geographic bboxes and tile indices
- **Export COCO JSON**: Download in COCO format for ML training
- **Download Labeled Tiles**: Download tile images for labeled tiles only
- **Download All Tiles**: Download all tiles in the labeling extent

## Data Storage

- `data/config.json` - Tile server configuration
- `data/ui_state.json` - UI state (viewport, active layers)
- `data/labels.geoparquet` - Labels/annotations
- `data/tiles/` - Downloaded tile images

## API Endpoints

### Config

- `GET /api/config` - Get configuration
- `PUT /api/config` - Update configuration
- `POST /api/config/tile-servers` - Add tile server
- `PUT/DELETE /api/config/tile-servers/{id}` - Update/delete tile server
- `GET/PUT /api/config/ui-state` - UI state

### Labels

- `GET /api/labels` - Get all labels
- `GET /api/labels/tile/{z}/{x}/{y}` - Get labels for tile
- `POST /api/labels` - Create label
- `PUT /api/labels/{id}` - Update label
- `DELETE /api/labels/{id}` - Delete label

### Export

- `GET /api/export/geojson` - Export as GeoJSON
- `GET /api/export/coco` - Export as COCO JSON
- `POST /api/export/download-tiles` - Download all tiles in extent (SSE)
- `GET /api/export/download-labeled-tiles` - Download labeled tiles (SSE)
