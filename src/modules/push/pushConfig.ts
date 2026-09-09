/**
 * Where the push Worker lives.
 *
 * Mirrors the arrangement in `@web/assistant/assistantKeyStore.ts`, including
 * the lesson recorded there: this must never fall back to `''`. An empty base
 * URL turns every call into a same-origin request against GitHub Pages, which
 * 404s silently — the feature would look broken only for real users, never in
 * development.
 *
 * The env var still overrides, for anyone self-hosting the Worker.
 */
export const PUSH_WORKER_URL: string =
    (import.meta.env.VITE_PUSH_WORKER_URL as string | undefined)
    ?? (import.meta.env.DEV
        ? 'http://localhost:8787'
        : 'https://arkadia-push-worker.delwing.workers.dev');
