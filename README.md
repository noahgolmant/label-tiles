# Annotate geospatial data with tile servers

AnnoTile is a small tool to annotate bounding boxes for geospatial datasets. It decouples labeling from data storage, since you can label any raster dataset that can be served by an [XYZ tile server](https://en.wikipedia.org/wiki/Tiled_web_map).

You can draw bounding boxes on tiles and export labels as GeoJSON, GeoParquet, or COCO JSON annotation format. You can also download the underlying tile images for ML training and inference. This is built with React + FastAPI + MapLibre.

Exported data is compatible with standard computer vision and ML frameworks like `pytorch` and `ultralytics`. See the example in [`examples/dataloader.py`](examples/dataloader.py) for how to load the COCO annotation output in PyTorch.

![AnnoTile Demo](assets/annotile-demo.gif)

## Features

- Configure multiple tile server URLs
- Draw bounding boxes within tiles
- Hotkey-driven label assignment for custom categories or negative examples
- Persist labels to GeoParquet, GeoJSON, or COCO JSON for ML training
- Download tiles over bounding boxes to build training datasets

## Prerequisites

- Python 3.12+ with [uv](https://github.com/astral-sh/uv)
- [pnpm](https://pnpm.io/)

## Quick Start

```bash
# If uv not installed:
curl -LsSf https://astral.sh/uv/install.sh | sh

# If pnpm not installed:
curl -fsSL https://get.pnpm.io/install.sh | sh

# Clone repo
git clone https://github.com/noahgolmant/annotile/tree/main
cd annotile

# Start web app & backend
make install && make dev
```

This will install all dependencies and start both the backend and frontend servers. The frontend runs at http://localhost:5173 and the backend API at http://localhost:8000.

Open http://localhost:5173 in your browser to start.

### Example tile server

Try it out on Esri's `World_Imagery` layer. Click `Config` and add this server:

```
https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

### Tile Server Backends

If you need custom tile servers for various data formats, here are some options:

#### Open Source

- [TiTiler](https://developmentseed.org/titiler/): Lightweight XYZ dynamic tiling for Cloud Optimized GeoTIFFs and other raster sources.
- [GeoServer](https://geoserver.org/): Supports serving vector and raster data using standard web protocols (WMS, WMTS, WFS, XYZ, etc).
- [xpublish](https://github.com/xpublish-community/xpublish): Built on Xarray for serving scientific (multi-dimensional) datasets. Useful for tiled access to netCDF or Zarr.

#### Proprietary

- [Earthscale](https://earthscale.ai/): The company behind AnnoTile, serve from cloud raster mosaics (COGs, Zarr, STAC).
- [Mapbox](https://www.mapbox.com/maps/): Raster tile hosting, global mapping API with commercial plans.
- [Esri](https://www.esri.com/): Offers a variety of servers and tile services for ArcGIS ecosystem users.
- [Google Earth Engine](https://earthengine.google.com/): you can use `ee.Image.getMap()` to get a temporary tile server URL for any given EE image.

### Detailed Makefile Commands

- `make install` or `make setup` - Install all dependencies (backend and frontend)
- `make dev` - Start both backend and frontend in development mode
- `make backend` - Start backend server only
- `make frontend` - Start frontend dev server only
- `make clean` - Clean build artifacts and dependencies
- `make help` - Show all available commands

## Scope

It is quite minimal in scope. Some benefits of this tool are:

- _Use what you have_: If you have an easy way to serve tiles for some data, you don't have to write additional code to label it.
- _Collaboration_: pass a config to a colleague and ask them to label another bbox on their local instance.
- _ML/analysis-ready export formats_ (It's also probably easy to ask Claude to modify this to support more formats if you'd like.)

Things this tool doesn't try to be good at:

- Advanced QA/QC workflows
- Complex attribute tagging

Areas where this could be improved (feel free to contribute!):

- Shared config setup for multiple users to annotate in parallel from the same deployment
- More export formats
- Pixel-level annotation

### Comparisons to other tools

**QGIS**: Supports tile server viz but requires more setup and manual export to ML formats. Better for complex GIS workflows, but complex for simple bounding box annotation. Doesn't support tile export.

**Roboflow**: Cloud-based annotation platform optimized for ML workflows. Requires uploading data and works best with non-geospatial images. Good for teams needing cloud collaboration and QA features.

**AnnoTile** is good when you have easy access to tile servers and want ML-ready exports without heavy data transfer.

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
