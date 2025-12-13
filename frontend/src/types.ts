// Tile Server configuration
export interface TileServer {
    id: string;
    name: string;
    url_template: string;
    bounds: [number, number, number, number]; // [west, south, east, north]
    min_zoom: number;
    max_zoom: number;
    tile_size: number;
}

// Application configuration
export interface Config {
    tile_servers: TileServer[];
    labeling_zoom: number;
    noun_phrases: string[];
    labeling_extent: [number, number, number, number] | null;
}

// Viewport state
export interface Viewport {
    latitude: number;
    longitude: number;
    zoom: number;
    bearing: number;
    pitch: number;
}

// UI State
export interface UIState {
    viewport: Viewport;
    active_layers: string[];
    selected_tile: TileInfo | null;
}

// Tile information
export interface TileInfo {
    x: number;
    y: number;
    z: number;
    bounds: [number, number, number, number]; // geographic bounds
}

// Label / Annotation
export interface Label {
    id: string;
    tile_x: number;
    tile_y: number;
    tile_z: number;
    pixel_bbox: [number, number, number, number]; // [x, y, width, height]
    noun_phrase: string | null;
    is_negative: boolean;
    geo_bounds: [number, number, number, number];
    created_at: string;
}

// Label creation request
export interface LabelCreate {
    tile_x: number;
    tile_y: number;
    tile_z: number;
    pixel_bbox: [number, number, number, number];
    noun_phrase: string | null;
    is_negative: boolean;
    geo_bounds: [number, number, number, number];
}

// Download progress
export interface DownloadProgress {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    current_tile: string | null;
    error: string | null;
}

// Drawing state for bbox (click-click pattern)
export interface DrawingState {
    isDrawing: boolean;
    firstCorner: { lng: number; lat: number } | null;
    currentCorner: { lng: number; lat: number } | null;
    tile: TileInfo | null;
}
