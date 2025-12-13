import { useEffect, useCallback } from 'react';

interface HotkeyConfig {
  nounPhrases: string[];
  onSelectPhrase: (index: number, phrase: string) => void;
  onMarkNegative: () => void;
  onDelete: () => void;
  onCancel: () => void;
  enabled?: boolean;
}

export function useHotkeys({
  nounPhrases,
  onSelectPhrase,
  onMarkNegative,
  onDelete,
  onCancel,
  enabled = true,
}: HotkeyConfig) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;
    
    // Ignore if typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const key = e.key.toLowerCase();

    // Number keys 1-9 for noun phrases
    if (/^[1-9]$/.test(key)) {
      const index = parseInt(key, 10) - 1;
      if (index < nounPhrases.length) {
        e.preventDefault();
        onSelectPhrase(index, nounPhrases[index]);
      }
      return;
    }

    // N for negative (no objects)
    if (key === 'n') {
      e.preventDefault();
      onMarkNegative();
      return;
    }

    // D or Delete/Backspace for delete
    if (key === 'd' || key === 'delete' || key === 'backspace') {
      e.preventDefault();
      onDelete();
      return;
    }

    // Escape to cancel
    if (key === 'escape') {
      e.preventDefault();
      onCancel();
      return;
    }
  }, [enabled, nounPhrases, onSelectPhrase, onMarkNegative, onDelete, onCancel]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

