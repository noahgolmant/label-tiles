import type { TileServer } from '../types';

interface LayerToggleProps {
  tileServers: TileServer[];
  activeLayers: string[];
  onToggle: (layerId: string) => void;
}

export function LayerToggle({ tileServers, activeLayers, onToggle }: LayerToggleProps) {
  return (
    <div className="layer-toggle">
      <h3>Layers</h3>
      <div className="layer-list">
        {tileServers.map((server) => (
          <label key={server.id} className="layer-item">
            <input
              type="checkbox"
              checked={activeLayers.includes(server.id)}
              onChange={() => onToggle(server.id)}
            />
            <span className="layer-name">{server.name}</span>
            <span className="layer-zoom">z{server.min_zoom}-{server.max_zoom}</span>
          </label>
        ))}
        {tileServers.length === 0 && (
          <p className="no-layers">No tile servers configured</p>
        )}
      </div>
    </div>
  );
}

