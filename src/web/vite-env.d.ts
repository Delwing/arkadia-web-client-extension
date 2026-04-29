/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_WEBSOCKET_URL?: string;
    readonly VITE_MAP_DATA_URL?: string;
    readonly VITE_MAP_COLORS_URL?: string;
    readonly VITE_MAP_RELEASE_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
