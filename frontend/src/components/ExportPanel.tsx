import { useState, useEffect } from "react";
import type { TileServer, DownloadProgress } from "../types";
import * as api from "../api/client";

interface ExportPanelProps {
    tileServers: TileServer[];
    activeLayers: string[];
    onClose: () => void;
}

export function ExportPanel({
    tileServers,
    activeLayers,
    onClose,
}: ExportPanelProps) {
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState<DownloadProgress | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [dataDirPath, setDataDirPath] = useState<string | null>(null);
    const [exportingGeoJSON, setExportingGeoJSON] = useState(false);
    const [exportingCOCO, setExportingCOCO] = useState(false);
    const [useGeoBbox, setUseGeoBbox] = useState(true);
    const [includeSurrounding, setIncludeSurrounding] = useState(false);

    const activeServer = tileServers.find((s) => activeLayers.includes(s.id));

    useEffect(() => {
        api.getDataDir()
            .then(({ path }) => setDataDirPath(path))
            .catch(() => setDataDirPath(null));
    }, []);

    const handleExportGeoJSON = async () => {
        setExportingGeoJSON(true);
        try {
            await api.exportGeoJSON(useGeoBbox);
            setMessage("GeoJSON exported and saved to data directory");
            setTimeout(() => setExportingGeoJSON(false), 1000);
        } catch (err) {
            setMessage("Failed to export GeoJSON");
            setExportingGeoJSON(false);
        }
    };

    const handleExportCOCO = async () => {
        setExportingCOCO(true);
        try {
            await api.exportCOCO(activeServer?.id);
            setMessage("COCO JSON exported and saved to data directory");
            setTimeout(() => setExportingCOCO(false), 1000);
        } catch (err) {
            setMessage("Failed to export COCO JSON");
            setExportingCOCO(false);
        }
    };

    const handleOpenDataDir = async () => {
        if (!dataDirPath) return;

        try {
            // Try to open directory via backend endpoint
            const res = await fetch(
                "http://localhost:8000/api/export/open-data-dir",
                {
                    method: "POST",
                }
            );
            if (res.ok) {
                setMessage("Data directory opened");
            } else {
                // Fallback: copy to clipboard
                await navigator.clipboard.writeText(dataDirPath);
                setMessage(
                    `Data directory path copied to clipboard: ${dataDirPath}`
                );
            }
        } catch (err) {
            // Fallback: copy to clipboard
            try {
                await navigator.clipboard.writeText(dataDirPath);
                setMessage(
                    `Data directory path copied to clipboard: ${dataDirPath}`
                );
            } catch (clipErr) {
                setMessage(`Data directory: ${dataDirPath}`);
            }
        }
    };

    const handleDownloadImages = () => {
        if (!activeServer) {
            setMessage("Please select a tile server layer first");
            return;
        }

        setDownloading(true);
        setProgress(null);
        setMessage(null);

        const cleanup = api.downloadTilesStream(
            activeServer.id,
            includeSurrounding,
            (p) => setProgress(p),
            () => {
                setDownloading(false);
                setMessage("Download complete");
            },
            (err) => {
                setDownloading(false);
                setMessage(`Download failed: ${err}`);
            }
        );

        // Store cleanup for potential cancel
        (window as any).__downloadCleanup = cleanup;
    };

    const handleDownloadAllImages = () => {
        if (!activeServer) {
            setMessage("Please select a tile server layer first");
            return;
        }

        setDownloading(true);
        setProgress(null);
        setMessage(null);

        const cleanup = api.downloadAllTilesStream(
            activeServer.id,
            (p) => setProgress(p),
            () => {
                setDownloading(false);
                setMessage("Download complete");
            },
            (err) => {
                setDownloading(false);
                setMessage(`Download failed: ${err}`);
            }
        );

        (window as any).__downloadCleanup = cleanup;
    };

    const handleCancel = () => {
        if ((window as any).__downloadCleanup) {
            (window as any).__downloadCleanup();
            delete (window as any).__downloadCleanup;
        }
        setDownloading(false);
        setMessage("Download cancelled");
    };

    return (
        <div className="export-panel">
            <div className="export-header">
                <h2>Export</h2>
                <button onClick={onClose} className="close-btn">
                    &times;
                </button>
            </div>

            <div className="export-section">
                <h3>Export Labels</h3>
                <div className={`message info`}>
                    Labels are automatically persisted as GeoParquet to{" "}
                    <code>data/labels.geoparquet</code>
                </div>
                <div className="export-buttons">
                    <div className="geojson-export-group">
                        <button
                            onClick={handleExportGeoJSON}
                            disabled={downloading || exportingGeoJSON}
                        >
                            Export GeoJSON
                        </button>
                        <div className="export-options">
                            <div className="radio-group-label">
                                GeoJSON coordinate format:
                            </div>
                            <label className="radio-label">
                                <input
                                    type="radio"
                                    name="geojson-coords"
                                    checked={useGeoBbox}
                                    onChange={() => setUseGeoBbox(true)}
                                />
                                <span>Geographic coordinates (lat/lon)</span>
                            </label>
                            <label className="radio-label">
                                <input
                                    type="radio"
                                    name="geojson-coords"
                                    checked={!useGeoBbox}
                                    onChange={() => setUseGeoBbox(false)}
                                />
                                <span>Relative to tile image coordinates</span>
                            </label>
                        </div>
                    </div>
                    <button
                        onClick={handleExportCOCO}
                        disabled={downloading || exportingCOCO}
                    >
                        Export COCO JSON
                    </button>
                </div>
                {dataDirPath && (
                    <button
                        onClick={handleOpenDataDir}
                        className="open-dir-btn"
                    >
                        Open Data Directory
                    </button>
                )}
            </div>

            <div className="export-section">
                <h3>Download Tile Images</h3>
                {activeServer ? (
                    <p className="server-info">Using: {activeServer.name}</p>
                ) : (
                    <p className="warning">Enable a tile server layer first</p>
                )}
                <div className="export-options">
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={includeSurrounding}
                            onChange={(e) =>
                                setIncludeSurrounding(e.target.checked)
                            }
                        />
                        <span>
                            Include surrounding tiles (for sliding window)
                        </span>
                    </label>
                </div>
                <div className="export-buttons">
                    <button
                        onClick={handleDownloadImages}
                        disabled={downloading || !activeServer}
                    >
                        Download Labeled Tiles
                    </button>
                    <button
                        onClick={handleDownloadAllImages}
                        disabled={downloading || !activeServer}
                    >
                        Download All Tiles in Extent
                    </button>
                </div>
            </div>

            {downloading && progress && (
                <div className="progress-section">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{
                                width: `${(progress.completed / progress.total) * 100}%`,
                            }}
                        />
                    </div>
                    <div className="progress-text">
                        {progress.completed} / {progress.total} tiles
                        {progress.skipped > 0 &&
                            ` (${progress.skipped} skipped)`}
                        {progress.failed > 0 && ` (${progress.failed} failed)`}
                    </div>
                    <button onClick={handleCancel} className="cancel-btn">
                        Cancel
                    </button>
                </div>
            )}

            {message && (
                <div
                    className={`message ${message.includes("failed") || message.includes("cancelled") ? "error" : "success"}`}
                >
                    {message}
                </div>
            )}
        </div>
    );
}
