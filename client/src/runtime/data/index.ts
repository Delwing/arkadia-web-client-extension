export * from './catalog';
export { DefaultDataCatalog } from './default-catalog';
export {
    registerCoreLoaders,
    createJsonLoader,
} from './core-loaders';
export { MAP_DATASET_KEY, NPC_DATASET_KEY, COLORS_DATASET_KEY } from './dataset-keys';
export type { DataSource } from './core-loaders';
export { IndexedDbPersistenceAdapter } from './persistence/indexeddb-adapter';
export { LocalStoragePersistenceAdapter } from './persistence/local-storage-adapter';
export type { DataPersistenceAdapter } from './persistence/types';
export type { NpcDefinition } from './types';
