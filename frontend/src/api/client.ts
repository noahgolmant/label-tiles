import type { Config, UIState, TileServer, Label, LabelCreate } from "../types";

const API_BASE = "http://localhost:8000/api";

// --- Config API ---

export async function getConfig(): Promise<Config> {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw new Error("Failed to fetch config");
    return res.json();
}

export async function updateConfig(config: Config): Promise<Config> {
    const res = await fetch(`${API_BASE}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error("Failed to update config");
    return res.json();
}

export async function addTileServer(
    server: Omit<TileServer, "id">
): Promise<TileServer> {
    const res = await fetch(`${API_BASE}/config/tile-servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(server),
    });
    if (!res.ok) throw new Error("Failed to add tile server");
    return res.json();
}

export async function updateTileServer(
    id: string,
    server: TileServer
): Promise<TileServer> {
    const res = await fetch(`${API_BASE}/config/tile-servers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(server),
    });
    if (!res.ok) throw new Error("Failed to update tile server");
    return res.json();
}

export async function deleteTileServer(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/config/tile-servers/${id}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete tile server");
}

export async function updateNounPhrases(phrases: string[]): Promise<string[]> {
    const res = await fetch(`${API_BASE}/config/noun-phrases`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(phrases),
    });
    if (!res.ok) throw new Error("Failed to update noun phrases");
    return res.json();
}

export async function updateLabelingZoom(zoom: number): Promise<number> {
    const res = await fetch(`${API_BASE}/config/labeling-zoom`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zoom),
    });
    if (!res.ok) throw new Error("Failed to update labeling zoom");
    return res.json();
}

export async function updateLabelingExtent(
    extent: [number, number, number, number] | null
): Promise<void> {
    const res = await fetch(`${API_BASE}/config/labeling-extent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extent),
    });
    if (!res.ok) throw new Error("Failed to update labeling extent");
}

// --- UI State API ---

export async function getUIState(): Promise<UIState> {
    const res = await fetch(`${API_BASE}/config/ui-state`);
    if (!res.ok) throw new Error("Failed to fetch UI state");
    return res.json();
}

export async function updateUIState(state: UIState): Promise<UIState> {
    const res = await fetch(`${API_BASE}/config/ui-state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error("Failed to update UI state");
    return res.json();
}

// --- Labels API ---

export async function getLabels(): Promise<Label[]> {
    const res = await fetch(`${API_BASE}/labels`);
    if (!res.ok) throw new Error("Failed to fetch labels");
    return res.json();
}

export async function getLabelsForTile(
    z: number,
    x: number,
    y: number
): Promise<Label[]> {
    const res = await fetch(`${API_BASE}/labels/tile/${z}/${x}/${y}`);
    if (!res.ok) throw new Error("Failed to fetch labels for tile");
    return res.json();
}

export async function createLabel(label: LabelCreate): Promise<Label> {
    const res = await fetch(`${API_BASE}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(label),
    });
    if (!res.ok) throw new Error("Failed to create label");
    return res.json();
}

export async function updateLabel(
    id: string,
    update: Partial<LabelCreate>
): Promise<Label> {
    const res = await fetch(`${API_BASE}/labels/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error("Failed to update label");
    return res.json();
}

export async function deleteLabel(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/labels/${id}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete label");
}

// --- Export API ---

export async function exportGeoJSON(): Promise<object> {
    const res = await fetch(`${API_BASE}/export/geojson`);
    if (!res.ok) throw new Error("Failed to export GeoJSON");
    return res.json();
}

export async function exportCOCO(tileServerId?: string): Promise<object> {
    const url = tileServerId
        ? `${API_BASE}/export/coco?tile_server_id=${tileServerId}`
        : `${API_BASE}/export/coco`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to export COCO");
    return res.json();
}

export async function getDataDir(): Promise<{ path: string }> {
    const res = await fetch(`${API_BASE}/export/data-dir`);
    if (!res.ok) throw new Error("Failed to get data directory");
    return res.json();
}

export function downloadTilesStream(
    tileServerId: string,
    onProgress: (progress: {
        total: number;
        completed: number;
        failed: number;
        skipped: number;
    }) => void,
    onComplete: () => void,
    onError: (error: string) => void
): () => void {
    const eventSource = new EventSource(
        `${API_BASE}/export/download-labeled-tiles?tile_server_id=${tileServerId}`
    );

    eventSource.addEventListener("progress", (e) => {
        const data = JSON.parse(e.data);
        onProgress(data);
    });

    eventSource.addEventListener("complete", () => {
        eventSource.close();
        onComplete();
    });

    eventSource.onerror = () => {
        eventSource.close();
        onError("Download failed");
    };

    return () => eventSource.close();
}

export function downloadAllTilesStream(
    tileServerId: string,
    onProgress: (progress: {
        total: number;
        completed: number;
        failed: number;
        skipped: number;
    }) => void,
    onComplete: () => void,
    onError: (error: string) => void
): () => void {
    const controller = new AbortController();

    fetch(`${API_BASE}/export/download-tiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tile_server_id: tileServerId }),
        signal: controller.signal,
    })
        .then(async (res) => {
            if (!res.ok) {
                onError("Failed to start download");
                return;
            }

            const reader = res.body?.getReader();
            if (!reader) return;

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = JSON.parse(line.slice(6));
                        if (data.status === "done") {
                            onComplete();
                        } else {
                            onProgress(data);
                        }
                    }
                }
            }
        })
        .catch((err) => {
            if (err.name !== "AbortError") {
                onError(err.message);
            }
        });

    return () => controller.abort();
}
