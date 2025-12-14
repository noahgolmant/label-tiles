import { useState, useCallback, useEffect } from "react";
import type { GeoTiffInfo, TileServer } from "../types";
import {
    getTitilerStatus,
    registerGeoTiff,
    listGeoTiffs,
    deleteGeoTiff,
} from "../api/client";

interface GeoTiffDropZoneProps {
    onAddTileServer: (server: Omit<TileServer, "id">) => Promise<TileServer>;
}

// Extend File type for Electron's path property
interface FileWithPath extends File {
    path?: string;
}

export function GeoTiffDropZone({ onAddTileServer }: GeoTiffDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [titilerAvailable, setTitilerAvailable] = useState<boolean | null>(
        null
    );
    const [registeredFiles, setRegisteredFiles] = useState<GeoTiffInfo[]>([]);
    const [showPathInput, setShowPathInput] = useState(false);
    const [pathInput, setPathInput] = useState("");

    // Check TiTiler status and load existing files on mount
    useEffect(() => {
        async function init() {
            try {
                const status = await getTitilerStatus();
                setTitilerAvailable(status.available);

                if (status.available) {
                    const { geotiffs } = await listGeoTiffs();
                    setRegisteredFiles(geotiffs);
                }
            } catch {
                setTitilerAvailable(false);
            }
        }
        init();
    }, []);

    const registerFile = useCallback(
        async (path: string) => {
            setError(null);
            setIsRegistering(true);

            try {
                const geotiffInfo = await registerGeoTiff(path);
                setRegisteredFiles((prev: GeoTiffInfo[]) => [
                    ...prev,
                    geotiffInfo,
                ]);

                // Auto-add as tile server
                await onAddTileServer({
                    name: geotiffInfo.filename,
                    url_template: geotiffInfo.tile_url_template,
                    bounds: geotiffInfo.bounds,
                    min_zoom: geotiffInfo.min_zoom,
                    max_zoom: geotiffInfo.max_zoom,
                    tile_size: 256,
                });
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Registration failed"
                );
            }

            setIsRegistering(false);
        },
        [onAddTileServer]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            setError(null);

            const files = Array.from(e.dataTransfer.files) as FileWithPath[];
            const tiffFiles = files.filter(
                (f) =>
                    f.name.toLowerCase().endsWith(".tif") ||
                    f.name.toLowerCase().endsWith(".tiff") ||
                    f.name.toLowerCase().endsWith(".geotiff")
            );

            if (tiffFiles.length === 0) {
                setError("Please drop a GeoTIFF file (.tif, .tiff)");
                return;
            }

            for (const file of tiffFiles) {
                // Try to get the local path (available in Electron/some contexts)
                const filePath = file.path;

                if (filePath) {
                    await registerFile(filePath);
                } else {
                    // Browser doesn't expose path - show manual input
                    setError(
                        `Browser doesn't expose file paths. Enter path manually for: ${file.name}`
                    );
                    setShowPathInput(true);
                }
            }
        },
        [registerFile]
    );

    const handlePathSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!pathInput.trim()) return;

            await registerFile(pathInput.trim());
            setPathInput("");
            setShowPathInput(false);
        },
        [pathInput, registerFile]
    );

    const handleDeleteGeoTiff = useCallback(async (fileId: string) => {
        try {
            await deleteGeoTiff(fileId);
            setRegisteredFiles((prev: GeoTiffInfo[]) =>
                prev.filter((f: GeoTiffInfo) => f.id !== fileId)
            );
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to unregister file"
            );
        }
    }, []);

    // Show loading state
    if (titilerAvailable === null) {
        return (
            <div className="geotiff-dropzone-container">
                <div className="geotiff-status loading">
                    Checking TiTiler status...
                </div>
            </div>
        );
    }

    // Show unavailable message
    if (!titilerAvailable) {
        return (
            <div className="geotiff-dropzone-container">
                <div className="geotiff-status unavailable">
                    <span className="status-icon">⚠️</span>
                    <span>TiTiler not installed</span>
                    <code>uv pip install -e ".[titiler]"</code>
                </div>
            </div>
        );
    }

    return (
        <div className="geotiff-dropzone-container">
            <div
                className={`geotiff-dropzone ${isDragging ? "dragging" : ""} ${isRegistering ? "registering" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isRegistering ? (
                    <div className="dropzone-content">
                        <span className="upload-spinner">⏳</span>
                        <span>Registering...</span>
                    </div>
                ) : (
                    <div className="dropzone-content">
                        <span className="dropzone-icon">🗺️</span>
                        <span>Drop GeoTIFF here</span>
                        <button
                            type="button"
                            className="path-toggle-btn"
                            onClick={() => setShowPathInput(!showPathInput)}
                        >
                            {showPathInput ? "Hide" : "Enter path manually"}
                        </button>
                    </div>
                )}
            </div>

            {showPathInput && (
                <form onSubmit={handlePathSubmit} className="geotiff-path-form">
                    <input
                        type="text"
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        placeholder="/path/to/your/file.tif"
                        className="geotiff-path-input"
                        disabled={isRegistering}
                    />
                    <button
                        type="submit"
                        className="geotiff-register-btn"
                        disabled={isRegistering || !pathInput.trim()}
                    >
                        Add
                    </button>
                </form>
            )}

            {error && <div className="geotiff-error">{error}</div>}

            {registeredFiles.length > 0 && (
                <div className="uploaded-files">
                    <h4>Registered GeoTIFFs</h4>
                    {registeredFiles.map((file: GeoTiffInfo) => (
                        <div key={file.id} className="uploaded-file">
                            <span className="file-name" title={file.path}>
                                {file.filename}
                            </span>
                            <button
                                onClick={() => handleDeleteGeoTiff(file.id)}
                                className="delete-btn"
                                title="Unregister file"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
