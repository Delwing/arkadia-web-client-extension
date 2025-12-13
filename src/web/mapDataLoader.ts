import { createMapDataLoader } from "@shared/map/dataLoader";
import { getMapColorsStore, getMapDataStore } from "./dataStores/mapStore";

const {
  loadMapData,
  loadColors,
  subscribeToMapData,
  subscribeToMapColors,
  subscribeToMapDataProgress,
} = createMapDataLoader({
  getMapDataStore,
  getMapColorsStore,
});

const getMapVersion = async (): Promise<string | undefined> => {
  const metadata = await getMapDataStore().getMetadata();
  return metadata?.hash;
};

const forceRefreshMapData = async (
  onProgress?: (progress: number, loaded?: number, total?: number) => void
): Promise<MapData.Map> => {
  const store = getMapDataStore();
  const snapshot = await store.refresh({ force: true, onProgress });
  if (!snapshot) {
    throw new Error("Map data unavailable");
  }
  return snapshot.data;
};

export {
  loadMapData,
  loadColors,
  subscribeToMapData,
  subscribeToMapColors,
  subscribeToMapDataProgress,
  getMapVersion,
  forceRefreshMapData,
};
