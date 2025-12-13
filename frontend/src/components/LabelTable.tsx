import type { Label } from '../types';

interface LabelTableProps {
  labels: Label[];
  selectedLabelId: string | null;
  onSelectLabel: (id: string | null) => void;
  onDeleteLabel: (id: string) => void;
}

export function LabelTable({
  labels,
  selectedLabelId,
  onSelectLabel,
  onDeleteLabel,
}: LabelTableProps) {
  // Group labels by tile
  const groupedLabels = labels.reduce((acc, label) => {
    const key = `${label.tile_z}/${label.tile_x}/${label.tile_y}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(label);
    return acc;
  }, {} as Record<string, Label[]>);

  const sortedTiles = Object.keys(groupedLabels).sort();

  return (
    <div className="label-table">
      <h3>Labels ({labels.length})</h3>
      <div className="label-list">
        {sortedTiles.length === 0 ? (
          <p className="no-labels">No labels yet. Draw bounding boxes on tiles.</p>
        ) : (
          sortedTiles.map((tileKey) => (
            <div key={tileKey} className="tile-group">
              <div className="tile-header">{tileKey}</div>
              {groupedLabels[tileKey].map((label) => (
                <div
                  key={label.id}
                  className={`label-row ${selectedLabelId === label.id ? 'selected' : ''} ${label.is_negative ? 'negative' : ''}`}
                  onClick={() => onSelectLabel(label.id)}
                >
                  <span className="label-phrase">
                    {label.is_negative ? '(no objects)' : label.noun_phrase || '(unlabeled)'}
                  </span>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLabel(label.id);
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

