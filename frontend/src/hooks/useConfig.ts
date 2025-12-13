import { useState, useEffect, useCallback } from 'react';
import type { Config, UIState, TileServer, Viewport } from '../types';
import * as api from '../api/client';

export function useConfig() {
  const [config, setConfig] = useState<Config | null>(null);
  const [uiState, setUIState] = useState<UIState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial config and UI state
  useEffect(() => {
    Promise.all([api.getConfig(), api.getUIState()])
      .then(([cfg, state]) => {
        setConfig(cfg);
        setUIState(state);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Add tile server
  const addTileServer = useCallback(async (server: Omit<TileServer, 'id'>) => {
    const newServer = await api.addTileServer(server);
    setConfig((prev) => prev ? {
      ...prev,
      tile_servers: [...prev.tile_servers, newServer],
    } : null);
    return newServer;
  }, []);

  // Update tile server
  const updateTileServer = useCallback(async (id: string, server: TileServer) => {
    const updated = await api.updateTileServer(id, server);
    setConfig((prev) => prev ? {
      ...prev,
      tile_servers: prev.tile_servers.map((s) => s.id === id ? updated : s),
    } : null);
    return updated;
  }, []);

  // Delete tile server
  const deleteTileServer = useCallback(async (id: string) => {
    await api.deleteTileServer(id);
    setConfig((prev) => prev ? {
      ...prev,
      tile_servers: prev.tile_servers.filter((s) => s.id !== id),
    } : null);
  }, []);

  // Update noun phrases
  const updateNounPhrases = useCallback(async (phrases: string[]) => {
    await api.updateNounPhrases(phrases);
    setConfig((prev) => prev ? { ...prev, noun_phrases: phrases } : null);
  }, []);

  // Update labeling zoom
  const updateLabelingZoom = useCallback(async (zoom: number) => {
    await api.updateLabelingZoom(zoom);
    setConfig((prev) => prev ? { ...prev, labeling_zoom: zoom } : null);
  }, []);

  // Update labeling extent
  const updateLabelingExtent = useCallback(async (extent: [number, number, number, number] | null) => {
    await api.updateLabelingExtent(extent);
    setConfig((prev) => prev ? { ...prev, labeling_extent: extent } : null);
  }, []);

  // Update viewport
  const updateViewport = useCallback(async (viewport: Viewport) => {
    if (!uiState) return;
    const newState = { ...uiState, viewport };
    setUIState(newState);
    await api.updateUIState(newState);
  }, [uiState]);

  // Toggle layer visibility
  const toggleLayer = useCallback(async (layerId: string) => {
    if (!uiState) return;
    const active = uiState.active_layers.includes(layerId)
      ? uiState.active_layers.filter((id) => id !== layerId)
      : [...uiState.active_layers, layerId];
    const newState = { ...uiState, active_layers: active };
    setUIState(newState);
    await api.updateUIState(newState);
  }, [uiState]);

  // Set active layers
  const setActiveLayers = useCallback(async (layers: string[]) => {
    if (!uiState) return;
    const newState = { ...uiState, active_layers: layers };
    setUIState(newState);
    await api.updateUIState(newState);
  }, [uiState]);

  return {
    config,
    uiState,
    loading,
    error,
    addTileServer,
    updateTileServer,
    deleteTileServer,
    updateNounPhrases,
    updateLabelingZoom,
    updateLabelingExtent,
    updateViewport,
    toggleLayer,
    setActiveLayers,
  };
}

