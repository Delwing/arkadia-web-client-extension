import {
    clearUiStoreClientEventBindings,
    resetUiStoreCatalogTracking,
    resetUiStoreRuntimeCleanup,
    restoreUiStoreBaseState,
    subscribeToCatalog,
    subscribeToRuntime,
} from "./store";

export function resetUiStoreForTesting() {
    clearUiStoreClientEventBindings();
    resetUiStoreRuntimeCleanup();
    resetUiStoreCatalogTracking();
    restoreUiStoreBaseState();
    subscribeToRuntime();
    subscribeToCatalog();
}
