import { useState, useEffect, useCallback } from 'react';
import type { Label, LabelCreate } from '../types';
import * as api from '../api/client';

export function useLabels() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all labels
  const loadLabels = useCallback(async () => {
    try {
      const data = await api.getLabels();
      setLabels(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load labels');
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadLabels().finally(() => setLoading(false));
  }, [loadLabels]);

  // Create a new label
  const createLabel = useCallback(async (label: LabelCreate) => {
    const newLabel = await api.createLabel(label);
    setLabels((prev) => [...prev, newLabel]);
    return newLabel;
  }, []);

  // Update an existing label
  const updateLabel = useCallback(async (id: string, update: Partial<LabelCreate>) => {
    const updated = await api.updateLabel(id, update);
    setLabels((prev) => prev.map((l) => l.id === id ? updated : l));
    return updated;
  }, []);

  // Delete a label
  const deleteLabel = useCallback(async (id: string) => {
    await api.deleteLabel(id);
    setLabels((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // Get labels for a specific tile
  const getLabelsForTile = useCallback((z: number, x: number, y: number) => {
    return labels.filter(
      (l) => l.tile_z === z && l.tile_x === x && l.tile_y === y
    );
  }, [labels]);

  // Check if tile is marked as negative
  const isTileNegative = useCallback((z: number, x: number, y: number) => {
    return labels.some(
      (l) => l.tile_z === z && l.tile_x === x && l.tile_y === y && l.is_negative
    );
  }, [labels]);

  // Mark tile as negative (no objects)
  const markTileNegative = useCallback(async (
    z: number, 
    x: number, 
    y: number, 
    geoBounds: [number, number, number, number]
  ) => {
    // Check if already marked
    const existing = labels.find(
      (l) => l.tile_z === z && l.tile_x === x && l.tile_y === y && l.is_negative
    );
    if (existing) return existing;

    return createLabel({
      tile_x: x,
      tile_y: y,
      tile_z: z,
      pixel_bbox: [0, 0, 0, 0],
      noun_phrase: null,
      is_negative: true,
      geo_bounds: geoBounds,
    });
  }, [labels, createLabel]);

  return {
    labels,
    loading,
    error,
    loadLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    getLabelsForTile,
    isTileNegative,
    markTileNegative,
  };
}

