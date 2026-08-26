/**
 * Per-device, never-synced settings for the AI assistant.
 *
 * Everything here is written with **raw `localStorage`**, deliberately:
 *
 * - The key is absent from `GlobalStorageSchema`, `globalStorageKeys` and
 *   `CATEGORY_REGISTRY`, so the Firebase payload layer (an allowlist for global
 *   keys) can never pick it up. Staying local by *omission* is the same
 *   mechanism `arkadia.driveToken` (`src/web/options/GoogleDriveTab.tsx`) uses
 *   for its OAuth token, and `arkadia.` is the established prefix for it.
 * - `TypedStorage.set` would additionally wake the sync debouncer
 *   (`syncEngine.handleStorageChange` ignores only the two Firebase keys), which
 *   is exactly what we do not want for an API key.
 *
 * The usual "never write raw localStorage" objection does not apply: no client
 * module subscribes to these keys, so there are no listeners to miss.
 *
 * `scope: 'device'` in `CATEGORY_REGISTRY` is NOT an alternative — device-scoped
 * categories are still uploaded, into `UnifiedSyncData.deviceCategories`.
 */

/** BYOK provider key. Never leaves the browser except to the chosen provider. */
const API_KEY = 'arkadia.assistantApiKey';
/** Base URL of the assistant Worker (`POST /ask`). */
const WORKER_URL_KEY = 'arkadia.assistantWorkerUrl';
/** OpenAI-compatible base URL used for the BYOK direct call. */
const BYOK_BASE_URL_KEY = 'arkadia.assistantByokBaseUrl';
/** Model id used for the BYOK direct call. */
const BYOK_MODEL_KEY = 'arkadia.assistantByokModel';
/** When `"1"`, the BYOK key is used first and the shared pool is skipped. */
const PREFER_BYOK_KEY = 'arkadia.assistantPreferByok';

/**
 * Where the shared Worker lives when the user has not overridden it.
 *
 * Dev builds default to a locally running `wrangler dev` (see `worker/`), so
 * `yarn dev` + `cd worker && yarn dev:mock` is a working pair with no setup.
 *
 * Production points at the deployed Worker as a literal rather than relying on
 * `VITE_ASSISTANT_WORKER_URL` being present at build time. It previously fell
 * back to `''`, which silently disables the shared-pool path entirely — and
 * since the env file that would have set it is gitignored, a CI build would
 * have shipped an assistant that quietly only worked for users who had pasted
 * their own API key. The env var still overrides, for anyone self-hosting.
 */
export const DEFAULT_WORKER_URL: string =
    (import.meta.env.VITE_ASSISTANT_WORKER_URL as string | undefined)
    ?? (import.meta.env.DEV
        ? 'http://localhost:8787'
        : 'https://arkadia-ai-worker.delwing.workers.dev');

/** Gemini's OpenAI-compatibility surface — the default BYOK target. */
export const DEFAULT_BYOK_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
export const DEFAULT_BYOK_MODEL = 'gemini-2.5-flash';

function read(key: string): string | null {
    try {
        const value = localStorage.getItem(key);
        return value && value.trim() !== '' ? value : null;
    } catch {
        return null;
    }
}

function write(key: string, value: string | null): void {
    try {
        if (value && value.trim() !== '') localStorage.setItem(key, value.trim());
        else localStorage.removeItem(key);
    } catch {
        /* private mode / storage disabled — the assistant degrades, nothing breaks */
    }
}

export function getAssistantApiKey(): string | null {
    return read(API_KEY);
}

export function setAssistantApiKey(value: string | null): void {
    write(API_KEY, value);
}

/**
 * Trailing slashes stripped so `${base}/ask` is always well-formed.
 *
 * Read raw rather than through `read()`: a stored **empty** string is a
 * meaningful value here ("no shared server, use my own key only") and must not
 * collapse back to the default the way an empty API key does.
 */
export function getWorkerUrl(): string {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(WORKER_URL_KEY);
    } catch {
        stored = null;
    }
    const value = stored ?? DEFAULT_WORKER_URL;
    return value.trim().replace(/\/+$/, '');
}

/** `null` restores the built-in default; `''` disables the Worker path. */
export function setWorkerUrl(value: string | null): void {
    try {
        if (value === null) localStorage.removeItem(WORKER_URL_KEY);
        else localStorage.setItem(WORKER_URL_KEY, value.trim().replace(/\/+$/, ''));
    } catch {
        /* storage disabled */
    }
}

/** True when the user typed a Worker URL of their own. */
export function hasCustomWorkerUrl(): boolean {
    return read(WORKER_URL_KEY) !== null;
}

export function getByokBaseUrl(): string {
    return (read(BYOK_BASE_URL_KEY) ?? DEFAULT_BYOK_BASE_URL).replace(/\/+$/, '');
}

export function setByokBaseUrl(value: string | null): void {
    write(BYOK_BASE_URL_KEY, value ? value.replace(/\/+$/, '') : null);
}

export function getByokModel(): string {
    return read(BYOK_MODEL_KEY) ?? DEFAULT_BYOK_MODEL;
}

export function setByokModel(value: string | null): void {
    write(BYOK_MODEL_KEY, value);
}

export function getPreferByok(): boolean {
    return read(PREFER_BYOK_KEY) === '1';
}

export function setPreferByok(value: boolean): void {
    write(PREFER_BYOK_KEY, value ? '1' : null);
}

/** Storage keys this module owns. Exported so a guard test can assert absence. */
export const ASSISTANT_LOCAL_KEYS = [
    API_KEY,
    WORKER_URL_KEY,
    BYOK_BASE_URL_KEY,
    BYOK_MODEL_KEY,
    PREFER_BYOK_KEY,
] as const;
