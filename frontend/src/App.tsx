import { useState, useCallback } from "react";
import { MapView } from "./components/MapView";
import { ConfigPanel } from "./components/ConfigPanel";
import { LayerToggle } from "./components/LayerToggle";
import { LabelTable } from "./components/LabelTable";
import { HotkeyLabelBar } from "./components/HotkeyLabelBar";
import { ExportPanel } from "./components/ExportPanel";
import { useConfig } from "./hooks/useConfig";
import { useLabels } from "./hooks/useLabels";
import { useHotkeys } from "./hooks/useHotkeys";
import type { TileInfo, DrawingState, Viewport, LabelCreate } from "./types";
import "./App.css";

function App() {
    const {
        config,
        uiState,
        loading,
        error,
        addTileServer,
        updateTileServer,
        deleteTileServer,
        updateNounPhrases,
        updateLabelingZoom,
        updateLabelingExtent,
        updateViewport,
        toggleLayer,
    } = useConfig();

    const {
        labels,
        createLabel,
        deleteLabel,
        markTileNegative,
        getLabelsForTile,
    } = useLabels();

    // UI state
    const [showConfig, setShowConfig] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const [selectedTile, setSelectedTile] = useState<TileInfo | null>(null);
    const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);

    // Active label - persists across multiple bbox drawings
    const [activeLabel, setActiveLabel] = useState<{
        index: number;
        phrase: string;
    } | null>(null);

    // None mode - when true, clicking tiles marks them as negative
    const [isNoneMode, setIsNoneMode] = useState(false);

    // Drawing state (click-click pattern)
    const [drawingState, setDrawingState] = useState<DrawingState>({
        isDrawing: false,
        firstCorner: null,
        currentCorner: null,
        tile: null,
    });

    // Handle viewport change
    const handleViewportChange = useCallback(
        (viewport: Viewport) => {
            updateViewport(viewport);
        },
        [updateViewport]
    );

    // First click - set first corner and start drawing, or mark tile as negative in None mode
    const handleFirstClick = useCallback(
        async (corner: { lng: number; lat: number }, tile: TileInfo) => {
            // If in None mode, mark tile as negative instead of starting drawing
            if (isNoneMode) {
                // Always select the tile first for visual feedback
                setSelectedTile(tile);

                // Check if tile has any labels (excluding negative labels)
                const tileLabels = getLabelsForTile(tile.z, tile.x, tile.y);
                const hasNonNegativeLabels = tileLabels.some(
                    (l) => !l.is_negative
                );

                if (hasNonNegativeLabels) {
                    // Can't mark as None if tile has labels
                    return;
                }

                await markTileNegative(tile.z, tile.x, tile.y, tile.bounds);
                return;
            }

            // Normal drawing mode - only start if we have an active label
            if (!activeLabel) {
                return;
            }

            setDrawingState({
                isDrawing: true,
                firstCorner: corner,
                currentCorner: corner,
                tile,
            });
            setSelectedTile(tile);
        },
        [isNoneMode, activeLabel, getLabelsForTile, markTileNegative]
    );

    // Mouse move - update current corner for preview
    const handleDrawMouseMove = useCallback(
        (corner: { lng: number; lat: number }) => {
            setDrawingState((prev) => ({ ...prev, currentCorner: corner }));
        },
        []
    );

    // Second click - finish drawing and create label immediately with activeLabel
    const handleSecondClick = useCallback(async () => {
        if (
            !drawingState.firstCorner ||
            !drawingState.currentCorner ||
            !drawingState.tile
        ) {
            setDrawingState({
                isDrawing: false,
                firstCorner: null,
                currentCorner: null,
                tile: null,
            });
            return;
        }

        // Must have an active label to create bbox
        if (!activeLabel) {
            return;
        }

        const { firstCorner, currentCorner, tile } = drawingState;

        // Calculate geo bounds
        const minLng = Math.min(firstCorner.lng, currentCorner.lng);
        const maxLng = Math.max(firstCorner.lng, currentCorner.lng);
        const minLat = Math.min(firstCorner.lat, currentCorner.lat);
        const maxLat = Math.max(firstCorner.lat, currentCorner.lat);

        // Minimum size check (in degrees - roughly check if too small)
        const lngDiff = maxLng - minLng;
        const latDiff = maxLat - minLat;
        if (lngDiff < 0.00001 || latDiff < 0.00001) {
            setDrawingState({
                isDrawing: false,
                firstCorner: null,
                currentCorner: null,
                tile: null,
            });
            return;
        }

        // Calculate pixel bbox within the tile
        const [west, south, east, north] = tile.bounds;
        const tileServer = config?.tile_servers.find((s) =>
            uiState?.active_layers.includes(s.id)
        );
        const tileSize = tileServer?.tile_size ?? 512;

        // Convert geo coords to pixel coords within tile
        const px1 = ((minLng - west) / (east - west)) * tileSize;
        const px2 = ((maxLng - west) / (east - west)) * tileSize;
        const py1 = ((north - maxLat) / (north - south)) * tileSize;
        const py2 = ((north - minLat) / (north - south)) * tileSize;

        // Clamp to tile bounds
        const x = Math.max(0, Math.min(tileSize, px1));
        const y = Math.max(0, Math.min(tileSize, py1));
        const w = Math.max(0, Math.min(tileSize - x, px2 - px1));
        const h = Math.max(0, Math.min(tileSize - y, py2 - py1));

        // Create the label immediately
        const labelData: LabelCreate = {
            tile_x: tile.x,
            tile_y: tile.y,
            tile_z: tile.z,
            pixel_bbox: [x, y, w, h],
            noun_phrase: activeLabel.phrase,
            is_negative: false,
            geo_bounds: [minLng, minLat, maxLng, maxLat],
        };

        await createLabel(labelData);

        setDrawingState({
            isDrawing: false,
            firstCorner: null,
            currentCorner: null,
            tile: null,
        });
    }, [
        drawingState,
        config?.tile_servers,
        uiState?.active_layers,
        activeLabel,
        createLabel,
    ]);

    // Handle phrase selection - sets the active label for subsequent bboxes
    const handleSelectPhrase = useCallback((index: number, phrase: string) => {
        setActiveLabel({ index, phrase });
        setIsNoneMode(false); // Exit None mode when selecting a phrase
    }, []);

    // Handle mark negative - enters None mode or marks current tile
    const handleMarkNegative = useCallback(async () => {
        // If a tile is selected, check if it has labels
        if (selectedTile) {
            const tileLabels = getLabelsForTile(
                selectedTile.z,
                selectedTile.x,
                selectedTile.y
            );
            const hasNonNegativeLabels = tileLabels.some((l) => !l.is_negative);

            if (hasNonNegativeLabels) {
                // Can't mark as None if tile has labels - just enter None mode
                setIsNoneMode(true);
                setActiveLabel(null); // Clear active label
                return;
            }

            // Mark the selected tile as negative
            await markTileNegative(
                selectedTile.z,
                selectedTile.x,
                selectedTile.y,
                selectedTile.bounds
            );
        } else {
            // No tile selected - enter None mode
            setIsNoneMode(true);
            setActiveLabel(null); // Clear active label
        }
    }, [selectedTile, markTileNegative, getLabelsForTile]);

    // Handle delete
    const handleDelete = useCallback(async () => {
        if (selectedLabelId) {
            await deleteLabel(selectedLabelId);
            setSelectedLabelId(null);
        }
    }, [selectedLabelId, deleteLabel]);

    // Handle cancel - cancels current drawing or exits None mode
    const handleCancel = useCallback(() => {
        if (isNoneMode) {
            setIsNoneMode(false);
        } else {
            setDrawingState({
                isDrawing: false,
                firstCorner: null,
                currentCorner: null,
                tile: null,
            });
        }
    }, [isNoneMode]);

    // Setup hotkeys - always enabled for label selection
    useHotkeys({
        nounPhrases: config?.noun_phrases ?? [],
        onSelectPhrase: handleSelectPhrase,
        onMarkNegative: handleMarkNegative,
        onDelete: handleDelete,
        onCancel: handleCancel,
        enabled: true,
    });

    if (loading) {
        return <div className="loading">Loading...</div>;
    }

    if (error || !config || !uiState) {
        return (
            <div className="error">
                Error: {error || "Failed to load config"}
            </div>
        );
    }

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <h1>Tile Labeler</h1>
                <div className="header-controls">
                    <button onClick={() => setShowConfig(true)}>Config</button>
                    <button onClick={() => setShowExport(true)}>Export</button>
                </div>
            </header>

            {/* Main content */}
            <div className="main">
                {/* Map area */}
                <div className="map-container">
                    <MapView
                        config={config}
                        uiState={uiState}
                        labels={labels}
                        onViewportChange={handleViewportChange}
                        drawingState={drawingState}
                        onFirstClick={handleFirstClick}
                        onMouseMove={handleDrawMouseMove}
                        onSecondClick={handleSecondClick}
                        selectedTile={selectedTile}
                        canDraw={!!activeLabel && !isNoneMode}
                        isNoneMode={isNoneMode}
                    />

                    {/* Layer toggle overlay */}
                    <div className="layer-overlay">
                        <LayerToggle
                            tileServers={config.tile_servers}
                            activeLayers={uiState.active_layers}
                            onToggle={toggleLayer}
                        />
                    </div>

                    {/* Zoom indicator */}
                    <div className="zoom-indicator">
                        Labeling at z{config.labeling_zoom}
                    </div>
                </div>

                {/* Sidebar */}
                <aside className="sidebar">
                    <LabelTable
                        labels={labels}
                        selectedLabelId={selectedLabelId}
                        onSelectLabel={setSelectedLabelId}
                        onDeleteLabel={deleteLabel}
                    />
                </aside>
            </div>

            {/* Hotkey bar */}
            <HotkeyLabelBar
                nounPhrases={config.noun_phrases}
                onSelectPhrase={handleSelectPhrase}
                onMarkNegative={handleMarkNegative}
                activeIndex={activeLabel?.index ?? null}
                isNoneMode={isNoneMode}
                selectedTile={selectedTile}
                getLabelsForTile={getLabelsForTile}
                enabled={true}
            />

            {/* Instructions based on state */}
            {isNoneMode && (
                <div className="instruction-hint active">
                    Click a tile to label it as having no class instances (Esc
                    to exit)
                </div>
            )}
            {!isNoneMode && !activeLabel && (
                <div className="instruction-hint">
                    Select a label category (1-9) to start drawing, or press N
                    for None mode
                </div>
            )}
            {!isNoneMode && activeLabel && !drawingState.isDrawing && (
                <div className="instruction-hint active">
                    Click to draw first edge of bbox
                </div>
            )}
            {!isNoneMode &&
                activeLabel &&
                drawingState.isDrawing &&
                drawingState.firstCorner && (
                    <div className="instruction-hint active">
                        Click again to finish bbox, Esc to cancel
                    </div>
                )}

            {/* Config panel modal */}
            {showConfig && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowConfig(false)}
                >
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <ConfigPanel
                            config={config}
                            onAddTileServer={addTileServer}
                            onUpdateTileServer={updateTileServer}
                            onDeleteTileServer={deleteTileServer}
                            onUpdateNounPhrases={updateNounPhrases}
                            onUpdateLabelingZoom={updateLabelingZoom}
                            onUpdateLabelingExtent={updateLabelingExtent}
                            onClose={() => setShowConfig(false)}
                        />
                    </div>
                </div>
            )}

            {/* Export panel modal */}
            {showExport && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowExport(false)}
                >
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <ExportPanel
                            tileServers={config.tile_servers}
                            activeLayers={uiState.active_layers}
                            onClose={() => setShowExport(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
