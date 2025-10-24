// This file provides a way to load map and colors data asynchronously.
import { ProgressListener, SubscriptionOptions } from '@client/src/dataStore/types';
import {
  getMapColorsStore,
  getMapDataStore,
} from './dataStores/mapStore';

const mapProgressListeners = new Set<ProgressListener>();

function buildProgressHandler(onProgress?: ProgressListener): ProgressListener | undefined {
  const listeners: ProgressListener[] = [];
  if (onProgress) {
    listeners.push(onProgress);
  }
  if (mapProgressListeners.size > 0) {
    listeners.push(...mapProgressListeners);
  }
  if (listeners.length === 0) {
    return undefined;
  }
  return (progress, loaded, total) => {
    for (const listener of [...listeners]) {
      listener(progress, loaded, total);
    }
  };
}

export async function loadMapData(
  onProgress?: ProgressListener,
): Promise<MapData.Map> {
  const store = getMapDataStore();
  const combinedProgress = buildProgressHandler(onProgress);
  try {
    const snapshot = await store.refresh({ onProgress: combinedProgress });
    if (!snapshot) {
      throw new Error('Map data unavailable');
    }
    return snapshot.data;
  } catch (error) {
    const fallback = await store.getSnapshot();
    if (fallback) {
      return fallback.data;
    }
    throw error;
  }
}

export async function loadColors(): Promise<MapData.Env[]> {
  const store = getMapColorsStore();
  try {
    const snapshot = await store.refresh();
    if (!snapshot) {
      throw new Error('Map colors unavailable');
    }
    return snapshot.data;
  } catch (error) {
    const fallback = await store.getSnapshot();
    if (fallback) {
      return fallback.data;
    }
    throw error;
  }
}

export function subscribeToMapData(
  listener: (map: MapData.Map | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  const store = getMapDataStore();
  return store.subscribe((snapshot) => listener(snapshot?.data), options);
}

export function subscribeToMapColors(
  listener: (colors: MapData.Env[] | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  const store = getMapColorsStore();
  return store.subscribe((snapshot) => listener(snapshot?.data), options);
}

export function subscribeToMapDataProgress(listener: ProgressListener): () => void {
  mapProgressListeners.add(listener);
  return () => {
    mapProgressListeners.delete(listener);
  };
}
