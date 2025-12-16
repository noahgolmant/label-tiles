import { useState, useCallback, useEffect } from "react";
import type { GeoTiffInfo, TileServer } from "../types";
import {
    getTitilerStatus,
    registerGeoTiff,
    listGeoTiffs,
    deleteGeoTiff,
} from "../api/client";

interface GeoTiffInputProps {
    onAddTileServer: (server: Omit<TileServer, "id">) => Promise<TileServer>;
    onGeoTiffAdded?: (bounds: [number, number, number, number]) => void;
    onToggleLayer?: (id: string) => void;
}

export function GeoTiffInput({
    onAddTileServer,
    onGeoTiffAdded,
    onToggleLayer,
}: GeoTiffInputProps) {
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [titilerAvailable, setTitilerAvailable] = useState<boolean | null>(
        null
    );
    const [registeredFiles, setRegisteredFiles] = useState<GeoTiffInfo[]>([]);
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
                const server = await onAddTileServer({
                    name: geotiffInfo.filename,
                    url_template: geotiffInfo.tile_url_template,
                    bounds: geotiffInfo.bounds,
                    min_zoom: geotiffInfo.min_zoom,
                    max_zoom: geotiffInfo.max_zoom,
                    tile_size: 256,
                });

                // Turn on the layer
                onToggleLayer?.(server.id);

                // Notify parent to zoom to bounds
                onGeoTiffAdded?.(geotiffInfo.bounds);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Registration failed"
                );
            }

            setIsRegistering(false);
        },
        [onAddTileServer, onGeoTiffAdded, onToggleLayer]
    );

    const handlePathSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!pathInput.trim()) return;

            await registerFile(pathInput.trim());
            setPathInput("");
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
            <div className="geotiff-input-container">
                <div className="geotiff-status loading">
                    Checking TiTiler status...
                </div>
            </div>
        );
    }

    // Show unavailable message
    if (!titilerAvailable) {
        return (
            <div className="geotiff-input-container">
                <div className="geotiff-status unavailable">
                    <span className="status-icon">⚠️</span>
                    <span>TiTiler not installed</span>
                    <code>uv pip install -e ".[titiler]"</code>
                </div>
            </div>
        );
    }

    return (
        <div className="geotiff-input-container">
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
                    {isRegistering ? "Adding..." : "Add GeoTIFF"}
                </button>
            </form>

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
