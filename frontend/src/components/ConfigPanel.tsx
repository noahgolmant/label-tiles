import { useState } from "react";
import type { Config, TileServer } from "../types";

interface ConfigPanelProps {
    config: Config;
    onAddTileServer: (server: Omit<TileServer, "id">) => Promise<TileServer>;
    onUpdateTileServer: (id: string, server: TileServer) => Promise<TileServer>;
    onDeleteTileServer: (id: string) => Promise<void>;
    onUpdateNounPhrases: (phrases: string[]) => Promise<void>;
    onUpdateLabelingZoom: (zoom: number) => Promise<void>;
    onUpdateLabelingExtent: (
        extent: [number, number, number, number] | null
    ) => Promise<void>;
    onClose: () => void;
}

export function ConfigPanel({
    config,
    onAddTileServer,
    onUpdateTileServer,
    onDeleteTileServer,
    onUpdateNounPhrases,
    onUpdateLabelingZoom,
    onUpdateLabelingExtent,
    onClose,
}: ConfigPanelProps) {
    const [newServerName, setNewServerName] = useState("");
    const [newServerUrl, setNewServerUrl] = useState("");
    const [newServerTileSize, setNewServerTileSize] = useState(512);
    const [newServerMinZoom, setNewServerMinZoom] = useState(0);
    const [newServerMaxZoom, setNewServerMaxZoom] = useState(22);
    const [editingServerId, setEditingServerId] = useState<string | null>(null);
    const [editServerName, setEditServerName] = useState("");
    const [editServerUrl, setEditServerUrl] = useState("");
    const [editServerTileSize, setEditServerTileSize] = useState(512);
    const [editServerMinZoom, setEditServerMinZoom] = useState(0);
    const [editServerMaxZoom, setEditServerMaxZoom] = useState(22);
    const [editServerBounds, setEditServerBounds] = useState<
        [number, number, number, number]
    >([-180, -85, 180, 85]);
    const [newPhrase, setNewPhrase] = useState("");
    const [extentInput, setExtentInput] = useState(
        config.labeling_extent ? config.labeling_extent.join(", ") : ""
    );

    const handleAddServer = async () => {
        if (!newServerName || !newServerUrl) return;
        await onAddTileServer({
            name: newServerName,
            url_template: newServerUrl,
            bounds: [-180, -85, 180, 85],
            min_zoom: newServerMinZoom,
            max_zoom: newServerMaxZoom,
            tile_size: newServerTileSize,
        });
        setNewServerName("");
        setNewServerUrl("");
        setNewServerTileSize(512);
        setNewServerMinZoom(0);
        setNewServerMaxZoom(22);
    };

    const handleStartEdit = (server: TileServer) => {
        setEditingServerId(server.id);
        setEditServerName(server.name);
        setEditServerUrl(server.url_template);
        setEditServerTileSize(server.tile_size);
        setEditServerMinZoom(server.min_zoom);
        setEditServerMaxZoom(server.max_zoom);
        setEditServerBounds(server.bounds);
    };

    const handleCancelEdit = () => {
        setEditingServerId(null);
        setEditServerName("");
        setEditServerUrl("");
        setEditServerTileSize(512);
        setEditServerMinZoom(0);
        setEditServerMaxZoom(22);
        setEditServerBounds([-180, -85, 180, 85]);
    };

    const handleSaveEdit = async () => {
        if (!editingServerId || !editServerName || !editServerUrl) return;
        const server = config.tile_servers.find(
            (s) => s.id === editingServerId
        );
        if (!server) return;
        await onUpdateTileServer(editingServerId, {
            ...server,
            name: editServerName,
            url_template: editServerUrl,
            tile_size: editServerTileSize,
            min_zoom: editServerMinZoom,
            max_zoom: editServerMaxZoom,
            bounds: editServerBounds,
        });
        handleCancelEdit();
    };

    const handleAddPhrase = async () => {
        if (!newPhrase || config.noun_phrases.includes(newPhrase)) return;
        await onUpdateNounPhrases([...config.noun_phrases, newPhrase]);
        setNewPhrase("");
    };

    const handleRemovePhrase = async (phrase: string) => {
        await onUpdateNounPhrases(
            config.noun_phrases.filter((p) => p !== phrase)
        );
    };

    const handleUpdateExtent = async () => {
        if (!extentInput.trim()) {
            await onUpdateLabelingExtent(null);
            return;
        }
        const parts = extentInput.split(",").map((s) => parseFloat(s.trim()));
        if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
            await onUpdateLabelingExtent(
                parts as [number, number, number, number]
            );
        }
    };

    return (
        <div className="config-panel">
            <div className="config-header">
                <h2>Configuration</h2>
                <button onClick={onClose} className="close-btn">
                    &times;
                </button>
            </div>

            <div className="config-section">
                <h3>Tile Servers</h3>
                <div className="server-list">
                    {config.tile_servers.map((server) => (
                        <div key={server.id} className="server-item">
                            {editingServerId === server.id ? (
                                <div className="server-edit-form">
                                    <input
                                        type="text"
                                        placeholder="Name"
                                        value={editServerName}
                                        onChange={(e) =>
                                            setEditServerName(e.target.value)
                                        }
                                    />
                                    <input
                                        type="text"
                                        placeholder="URL template ({z}/{x}/{y})"
                                        value={editServerUrl}
                                        onChange={(e) =>
                                            setEditServerUrl(e.target.value)
                                        }
                                    />
                                    <input
                                        type="number"
                                        placeholder="Tile size"
                                        value={editServerTileSize}
                                        onChange={(e) =>
                                            setEditServerTileSize(
                                                parseInt(e.target.value) || 512
                                            )
                                        }
                                        style={{ width: "80px" }}
                                    />
                                    <input
                                        type="number"
                                        placeholder="Min zoom"
                                        value={editServerMinZoom}
                                        onChange={(e) =>
                                            setEditServerMinZoom(
                                                parseInt(e.target.value) || 0
                                            )
                                        }
                                        min="0"
                                        max="22"
                                        style={{ width: "80px" }}
                                    />
                                    <input
                                        type="number"
                                        placeholder="Max zoom"
                                        value={editServerMaxZoom}
                                        onChange={(e) =>
                                            setEditServerMaxZoom(
                                                parseInt(e.target.value) || 22
                                            )
                                        }
                                        min="0"
                                        max="22"
                                        style={{ width: "80px" }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Bounds (west, south, east, north)"
                                        value={editServerBounds.join(", ")}
                                        onChange={(e) => {
                                            const parts = e.target.value
                                                .split(",")
                                                .map((s) =>
                                                    parseFloat(s.trim())
                                                );
                                            if (
                                                parts.length === 4 &&
                                                parts.every((n) => !isNaN(n))
                                            ) {
                                                setEditServerBounds(
                                                    parts as [
                                                        number,
                                                        number,
                                                        number,
                                                        number,
                                                    ]
                                                );
                                            }
                                        }}
                                        style={{ width: "200px" }}
                                    />
                                    <button
                                        onClick={handleSaveEdit}
                                        className="save-btn"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={handleCancelEdit}
                                        className="cancel-btn"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <span className="server-name">
                                        {server.name}
                                    </span>
                                    <span className="server-size">
                                        {server.tile_size}px
                                    </span>
                                    <span className="server-zoom">
                                        Zoom: {server.min_zoom}-
                                        {server.max_zoom}
                                    </span>
                                    <button
                                        onClick={() => handleStartEdit(server)}
                                        className="edit-btn"
                                        title="Edit server"
                                    >
                                        ✎
                                    </button>
                                    <button
                                        onClick={() =>
                                            onDeleteTileServer(server.id)
                                        }
                                        className="delete-btn"
                                        title="Delete server"
                                    >
                                        &times;
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
                <div className="add-server">
                    <input
                        type="text"
                        placeholder="Name"
                        value={newServerName}
                        onChange={(e) => setNewServerName(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="URL template ({z}/{x}/{y})"
                        value={newServerUrl}
                        onChange={(e) => setNewServerUrl(e.target.value)}
                    />
                    <input
                        type="number"
                        placeholder="Tile size"
                        value={newServerTileSize}
                        onChange={(e) =>
                            setNewServerTileSize(
                                parseInt(e.target.value) || 512
                            )
                        }
                        style={{ width: "80px" }}
                    />
                    <input
                        type="number"
                        placeholder="Min zoom"
                        value={newServerMinZoom}
                        onChange={(e) =>
                            setNewServerMinZoom(parseInt(e.target.value) || 0)
                        }
                        min="0"
                        max="22"
                        style={{ width: "80px" }}
                    />
                    <input
                        type="number"
                        placeholder="Max zoom"
                        value={newServerMaxZoom}
                        onChange={(e) =>
                            setNewServerMaxZoom(parseInt(e.target.value) || 22)
                        }
                        min="0"
                        max="22"
                        style={{ width: "80px" }}
                    />
                    <button onClick={handleAddServer}>Add</button>
                </div>
            </div>

            <div className="config-section">
                <h3>Labeling Zoom Level</h3>
                <div className="zoom-control">
                    <input
                        type="range"
                        min="10"
                        max="22"
                        value={config.labeling_zoom}
                        onChange={(e) =>
                            onUpdateLabelingZoom(parseInt(e.target.value))
                        }
                    />
                    <span>{config.labeling_zoom}</span>
                </div>
            </div>

            <div className="config-section">
                <h3>Labeling Extent</h3>
                <div className="extent-control">
                    <input
                        type="text"
                        placeholder="west, south, east, north"
                        value={extentInput}
                        onChange={(e) => setExtentInput(e.target.value)}
                    />
                    <button onClick={handleUpdateExtent}>Set</button>
                </div>
                <p className="hint">Leave empty to use visible map extent</p>
            </div>

            <div className="config-section">
                <h3>Label Categories (Hotkeys 1-9)</h3>
                <div className="phrase-list">
                    {config.noun_phrases.map((phrase, i) => (
                        <div key={phrase} className="phrase-item">
                            <span className="phrase-key">{i + 1}</span>
                            <span className="phrase-text">{phrase}</span>
                            <button
                                onClick={() => handleRemovePhrase(phrase)}
                                className="delete-btn"
                            >
                                &times;
                            </button>
                        </div>
                    ))}
                </div>
                <div className="add-phrase">
                    <input
                        type="text"
                        placeholder="New label category"
                        value={newPhrase}
                        onChange={(e) => setNewPhrase(e.target.value)}
                        onKeyDown={(e) =>
                            e.key === "Enter" && handleAddPhrase()
                        }
                    />
                    <button onClick={handleAddPhrase}>Add</button>
                </div>
            </div>
        </div>
    );
}
