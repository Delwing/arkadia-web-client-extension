/**
 * Where the crowd Worker lives. Never falls back to `''` — see pushConfig.ts
 * for why an empty base URL fails silently in production only.
 */
export const CROWD_WORKER_URL: string =
    (import.meta.env.VITE_CROWD_WORKER_URL as string | undefined)
    ?? (import.meta.env.DEV
        ? 'http://localhost:8787'
        : 'https://arkadia-crowd-worker.delwing.workers.dev');
