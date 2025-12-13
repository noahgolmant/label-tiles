interface HotkeyLabelBarProps {
    nounPhrases: string[];
    onSelectPhrase: (index: number, phrase: string) => void;
    onMarkNegative: () => void;
    activeIndex: number | null;
    isNoneMode: boolean;
    selectedTile: { z: number; x: number; y: number } | null;
    getLabelsForTile: (
        z: number,
        x: number,
        y: number
    ) => Array<{ is_negative: boolean }>;
    enabled: boolean;
}

export function HotkeyLabelBar({
    nounPhrases,
    onSelectPhrase,
    onMarkNegative,
    activeIndex,
    isNoneMode,
    selectedTile,
    getLabelsForTile,
}: HotkeyLabelBarProps) {
    // Check if None button should be disabled
    const isNoneDisabled = selectedTile
        ? (() => {
              const tileLabels = getLabelsForTile(
                  selectedTile.z,
                  selectedTile.x,
                  selectedTile.y
              );
              return tileLabels.some((l) => !l.is_negative);
          })()
        : false;

    return (
        <div className="hotkey-bar">
            {nounPhrases.slice(0, 9).map((phrase, i) => (
                <button
                    key={phrase}
                    className={`hotkey-btn ${activeIndex === i ? "active" : ""}`}
                    onClick={() => onSelectPhrase(i, phrase)}
                >
                    <span className="hotkey-key">{i + 1}</span>
                    <span className="hotkey-label">{phrase}</span>
                </button>
            ))}
            <button
                className={`hotkey-btn negative ${isNoneMode ? "active" : ""} ${isNoneDisabled ? "disabled" : ""}`}
                onClick={() => onMarkNegative()}
                disabled={isNoneDisabled}
                title={
                    isNoneDisabled
                        ? "Cannot mark tile as None: tile has labels"
                        : isNoneMode
                          ? "Click tiles to mark as None (Esc to exit)"
                          : "Mark tile as having no class instances"
                }
            >
                <span className="hotkey-key">N</span>
                <span className="hotkey-label">none</span>
            </button>
        </div>
    );
}
