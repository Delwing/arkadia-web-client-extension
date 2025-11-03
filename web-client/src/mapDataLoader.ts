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

export {
  loadMapData,
  loadColors,
  subscribeToMapData,
  subscribeToMapColors,
  subscribeToMapDataProgress,
};
