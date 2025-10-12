import { __uiStoreTestApi, uiStore } from "../../src/ui/store";

if (!__uiStoreTestApi) {
    throw new Error("UI store test utilities are unavailable outside of the test environment.");
}

export const resetUiStoreForTesting = () => {
    __uiStoreTestApi.resetUiStoreForTesting();
};

export { uiStore };
