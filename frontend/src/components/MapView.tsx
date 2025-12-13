import { useRef, useCallback, useEffect, useState } from "react";
import Map, {
    NavigationControl,
    ScaleControl,
    Source,
    Layer,
} from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import type { Feature, Polygon, FeatureCollection } from "geojson";
import type {
    Config,
    UIState,
    Label,
    TileInfo,
    DrawingState,
    Viewport,
} from "../types";
import "maplibre-gl/dist/maplibre-gl.css";

// Tile math utilities
function clampLat(lat: number): number {
    const max = 85.0511287798066;
    return Math.max(Math.min(lat, max), -max);
}

function lonToTileX(lon: number, z: number): number {
    const n = Math.pow(2, z);
    return ((lon + 180) / 360) * n;
}

function latToTileY(lat: number, z: number): number {
    const n = Math.pow(2, z);
    const phi = (clampLat(lat) * Math.PI) / 180;
    const y = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
    return y * n;
}

function tileXToLon(x: number, z: number): number {
    const n = Math.pow(2, z);
    return (x / n) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
    const n = Math.pow(2, z);
    const t = Math.PI - (2 * Math.PI * y) / n;
    return (180 / Math.PI) * Math.atan(Math.sinh(t));
}

export function getTileBounds(
    x: number,
    y: number,
    z: number
): [number, number, number, number] {
    const west = tileXToLon(x, z);
    const east = tileXToLon(x + 1, z);
    const north = tileYToLat(y, z);
    const south = tileYToLat(y + 1, z);
    return [west, south, east, north];
}

export function getTileAtPoint(lng: number, lat: number, z: number): TileInfo {
    const x = Math.floor(lonToTileX(lng, z));
    const y = Math.floor(latToTileY(lat, z));
    return {
        x,
        y,
        z,
        bounds: getTileBounds(x, y, z),
    };
}

interface MapViewProps {
    config: Config;
    uiState: UIState;
    labels: Label[];
    onViewportChange: (viewport: Viewport) => void;
    drawingState: DrawingState;
    onFirstClick: (
        corner: { lng: number; lat: number },
        tile: TileInfo
    ) => void;
    onMouseMove: (corner: { lng: number; lat: number }) => void;
    onSecondClick: () => void;
    selectedTile: TileInfo | null;
    canDraw: boolean;
    isNoneMode: boolean;
}

export function MapView({
    config,
    uiState,
    labels,
    onViewportChange,
    drawingState,
    onFirstClick,
    onMouseMove: onDrawMouseMove,
    onSecondClick,
    selectedTile,
    canDraw,
    isNoneMode,
}: MapViewProps) {
    const mapRef = useRef<MapRef>(null);
    const [cursor, setCursor] = useState("grab");

    const handleMoveEnd = useCallback(
        (e: {
            viewState: {
                latitude: number;
                longitude: number;
                zoom: number;
                bearing: number;
                pitch: number;
            };
        }) => {
            const { latitude, longitude, zoom, bearing, pitch } = e.viewState;
            onViewportChange({ latitude, longitude, zoom, bearing, pitch });
        },
        [onViewportChange]
    );

    // Handle click for bbox drawing (click-click pattern) or None mode
    const handleClick = useCallback(
        (e: MapLayerMouseEvent) => {
            const { lng, lat } = e.lngLat;
            const tile = getTileAtPoint(lng, lat, config.labeling_zoom);

            // In None mode, always call onFirstClick (which handles marking as negative)
            if (isNoneMode) {
                onFirstClick({ lng, lat }, tile);
                return;
            }

            // Don't start new drawing if no label is selected
            if (!canDraw && !drawingState.firstCorner) return;

            if (!drawingState.firstCorner) {
                // First click - set first corner
                onFirstClick({ lng, lat }, tile);
            } else {
                // Second click - finish drawing
                onSecondClick();
            }
        },
        [
            config.labeling_zoom,
            drawingState.firstCorner,
            onFirstClick,
            onSecondClick,
            canDraw,
            isNoneMode,
        ]
    );

    // Handle mouse move to update bbox preview
    const handleMouseMove = useCallback(
        (e: MapLayerMouseEvent) => {
            if (!drawingState.isDrawing || !drawingState.firstCorner) return;

            const { lng, lat } = e.lngLat;
            onDrawMouseMove({ lng, lat });
        },
        [drawingState.isDrawing, drawingState.firstCorner, onDrawMouseMove]
    );

    // Set cursor style based on drawing state
    useEffect(() => {
        if (isNoneMode) {
            setCursor("pointer");
        } else if (drawingState.isDrawing) {
            setCursor("crosshair");
        } else if (canDraw) {
            setCursor("crosshair");
        } else {
            setCursor("grab");
        }
    }, [drawingState.isDrawing, canDraw, isNoneMode]);

    // Generate tile grid GeoJSON
    const generateTileGrid = useCallback((): FeatureCollection<Polygon> => {
        const map = mapRef.current?.getMap();
        if (!map) return { type: "FeatureCollection", features: [] };

        const bounds = map.getBounds();
        const zoom = config.labeling_zoom;

        const west = bounds.getWest();
        const east = bounds.getEast();
        const north = clampLat(bounds.getNorth());
        const south = clampLat(bounds.getSouth());

        const n = Math.pow(2, zoom);
        const xStart = Math.floor(lonToTileX(west, zoom));
        const xEnd = Math.floor(lonToTileX(east, zoom));
        let yStart = Math.floor(latToTileY(north, zoom));
        let yEnd = Math.floor(latToTileY(south, zoom));
        yStart = Math.max(0, Math.min(yStart, n - 1));
        yEnd = Math.max(0, Math.min(yEnd, n - 1));

        const features: Feature<Polygon>[] = [];

        const addTile = (x: number, y: number) => {
            const xx = ((x % n) + n) % n;
            const [westLon, southLat, eastLon, northLat] = getTileBounds(
                xx,
                y,
                zoom
            );

            features.push({
                type: "Feature",
                properties: { x: xx, y, z: zoom },
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [westLon, northLat],
                            [eastLon, northLat],
                            [eastLon, southLat],
                            [westLon, southLat],
                            [westLon, northLat],
                        ],
                    ],
                },
            });
        };

        if (west <= east) {
            for (let x = xStart; x <= xEnd; x++) {
                for (let y = yStart; y <= yEnd; y++) {
                    addTile(x, y);
                }
            }
        } else {
            for (let x = xStart; x < n; x++) {
                for (let y = yStart; y <= yEnd; y++) {
                    addTile(x, y);
                }
            }
            for (let x = 0; x <= xEnd; x++) {
                for (let y = yStart; y <= yEnd; y++) {
                    addTile(x, y);
                }
            }
        }

        return { type: "FeatureCollection", features };
    }, [config.labeling_zoom]);

    // Generate labels GeoJSON
    const labelsGeoJSON = useCallback((): FeatureCollection<Polygon> => {
        const features: Feature<Polygon>[] = labels.map((label) => ({
            type: "Feature",
            properties: {
                id: label.id,
                noun_phrase: label.noun_phrase,
                is_negative: label.is_negative,
            },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [label.geo_bounds[0], label.geo_bounds[3]], // NW
                        [label.geo_bounds[2], label.geo_bounds[3]], // NE
                        [label.geo_bounds[2], label.geo_bounds[1]], // SE
                        [label.geo_bounds[0], label.geo_bounds[1]], // SW
                        [label.geo_bounds[0], label.geo_bounds[3]], // NW
                    ],
                ],
            },
        }));
        return { type: "FeatureCollection", features };
    }, [labels]);

    // Generate selected tile GeoJSON
    const selectedTileGeoJSON = useCallback((): FeatureCollection<Polygon> => {
        if (!selectedTile) return { type: "FeatureCollection", features: [] };

        const [west, south, east, north] = selectedTile.bounds;
        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [west, north],
                                [east, north],
                                [east, south],
                                [west, south],
                                [west, north],
                            ],
                        ],
                    },
                },
            ],
        };
    }, [selectedTile]);

    // Generate drawing bbox GeoJSON (using geo coords directly now)
    const drawingBboxGeoJSON = useCallback((): FeatureCollection<Polygon> => {
        if (
            !drawingState.isDrawing ||
            !drawingState.firstCorner ||
            !drawingState.currentCorner
        ) {
            return { type: "FeatureCollection", features: [] };
        }

        const { firstCorner, currentCorner } = drawingState;

        const minLng = Math.min(firstCorner.lng, currentCorner.lng);
        const maxLng = Math.max(firstCorner.lng, currentCorner.lng);
        const minLat = Math.min(firstCorner.lat, currentCorner.lat);
        const maxLat = Math.max(firstCorner.lat, currentCorner.lat);

        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [minLng, maxLat],
                                [maxLng, maxLat],
                                [maxLng, minLat],
                                [minLng, minLat],
                                [minLng, maxLat],
                            ],
                        ],
                    },
                },
            ],
        };
    }, [drawingState]);

    const [tileGrid, setTileGrid] = useState<FeatureCollection<Polygon>>({
        type: "FeatureCollection",
        features: [],
    });

    // Update tile grid on move
    const updateTileGrid = useCallback(() => {
        setTileGrid(generateTileGrid());
    }, [generateTileGrid]);

    return (
        <Map
            ref={mapRef}
            initialViewState={uiState.viewport}
            style={{ width: "100%", height: "100%" }}
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            minZoom={config.labeling_zoom - 6}
            maxZoom={config.labeling_zoom + 3}
            onMoveEnd={handleMoveEnd}
            onMove={updateTileGrid}
            onLoad={updateTileGrid}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            cursor={cursor}
        >
            {/* Tile server layers - inserted before labeling layers */}
            {config.tile_servers.map(
                (server) =>
                    uiState.active_layers.includes(server.id) && (
                        <Source
                            key={server.id}
                            id={`tiles-${server.id}`}
                            type="raster"
                            tiles={[server.url_template]}
                            tileSize={server.tile_size}
                            bounds={server.bounds}
                            minzoom={server.min_zoom}
                        >
                            <Layer
                                id={`layer-${server.id}`}
                                type="raster"
                                paint={{
                                    "raster-opacity": 0.8,
                                    "raster-resampling": "nearest",
                                }}
                                minzoom={server.min_zoom}
                                beforeId="tile-grid-line"
                            />
                        </Source>
                    )
            )}

            {/* Tile grid overlay - labeling layers rendered on top */}
            <Source id="tile-grid" type="geojson" data={tileGrid}>
                <Layer
                    id="tile-grid-line"
                    type="line"
                    paint={{
                        "line-color": "#00ff00",
                        "line-width": 1,
                        "line-opacity": 0.8,
                    }}
                />
            </Source>

            {/* Selected tile highlight */}
            <Source
                id="selected-tile"
                type="geojson"
                data={selectedTileGeoJSON()}
            >
                <Layer
                    id="selected-tile-fill"
                    type="fill"
                    paint={{
                        "fill-color": "#00ff00",
                        "fill-opacity": 0.15,
                    }}
                />
                <Layer
                    id="selected-tile-line"
                    type="line"
                    paint={{
                        "line-color": "#00ff00",
                        "line-width": 3,
                    }}
                />
            </Source>

            {/* Existing labels */}
            <Source id="labels" type="geojson" data={labelsGeoJSON()}>
                <Layer
                    id="labels-fill"
                    type="fill"
                    paint={{
                        "fill-color": [
                            "case",
                            ["get", "is_negative"],
                            "#ff6b6b",
                            "#4dabf7",
                        ],
                        "fill-opacity": 0.3,
                    }}
                />
                <Layer
                    id="labels-line"
                    type="line"
                    paint={{
                        "line-color": [
                            "case",
                            ["get", "is_negative"],
                            "#ff6b6b",
                            "#4dabf7",
                        ],
                        "line-width": 2,
                    }}
                />
            </Source>

            {/* Drawing bbox */}
            <Source
                id="drawing-bbox"
                type="geojson"
                data={drawingBboxGeoJSON()}
            >
                <Layer
                    id="drawing-bbox-fill"
                    type="fill"
                    paint={{
                        "fill-color": "#ffd43b",
                        "fill-opacity": 0.4,
                    }}
                />
                <Layer
                    id="drawing-bbox-line"
                    type="line"
                    paint={{
                        "line-color": "#ffd43b",
                        "line-width": 2,
                        "line-dasharray": [2, 2],
                    }}
                />
            </Source>

            <NavigationControl position="bottom-right" />
            <ScaleControl position="bottom-left" />
        </Map>
    );
}
