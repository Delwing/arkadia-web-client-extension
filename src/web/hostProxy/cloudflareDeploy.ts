/**
 * Minimal Cloudflare API client for the "Host your own proxy" deploy wizard.
 *
 * The wizard uses the user's API token to:
 *   1. List accounts the token can access (listAccounts) — also a validity check
 *   2. Upload the proxy worker script (deployWorker)
 *   3. Enable the *.workers.dev route on it (enableWorkersDevRoute)
 *   4. Look up the account's workers.dev subdomain (getWorkersSubdomain)
 *
 * Cloudflare's API rejects cross-origin browser requests, so every call is
 * tunneled through the default proxy Worker's HTTP-forward mode (`?url=<target>`),
 * which adds CORS headers and strips Origin/Referer/Cookie. The relay base is
 * passed in by the caller so this module stays decoupled from app config.
 *
 * The token never leaves the caller's component state — it is passed per call
 * and never persisted here.
 */

const API_BASE = 'https://api.cloudflare.com/client/v4';

// Pin a compat date so the deployed Worker has stable runtime semantics.
const COMPAT_DATE = '2024-09-23';

export interface CloudflareAccount {
    id: string;
    name: string;
}

export class CloudflareApiError extends Error {
    readonly status: number;
    readonly cfErrors?: { code: number; message: string }[];

    constructor(message: string, status: number, cfErrors?: { code: number; message: string }[]) {
        super(message);
        this.name = 'CloudflareApiError';
        this.status = status;
        this.cfErrors = cfErrors;
    }
}

interface CfEnvelope<T> {
    success: boolean;
    result: T;
    errors?: { code: number; message: string }[];
}

/**
 * Build a relay URL that the proxy Worker forwards to. Accepts any form of the
 * proxy URL (wss://host, wss://host?host=..&port=..) and uses only its host.
 */
function relayUrl(target: string, relayBase: string): string {
    const host = new URL(relayBase).host;
    return `https://${host}/?url=${encodeURIComponent(target)}`;
}

async function parseEnvelope<T>(res: Response): Promise<T> {
    let body: CfEnvelope<T> | undefined;
    try {
        body = await res.json() as CfEnvelope<T>;
    } catch {
        throw new CloudflareApiError(
            `Cloudflare API returned ${res.status} ${res.statusText}`,
            res.status,
        );
    }
    if (!res.ok || !body.success) {
        const summary = body.errors?.[0]?.message
            ?? `Cloudflare API returned ${res.status} ${res.statusText}`;
        throw new CloudflareApiError(summary, res.status, body.errors);
    }
    return body.result;
}

function authHeaders(token: string): HeadersInit {
    return { Authorization: `Bearer ${token}` };
}

/** Lists accounts visible to the token; doubles as a token-validity check. */
export async function listAccounts(token: string, relayBase: string): Promise<CloudflareAccount[]> {
    const res = await fetch(relayUrl(`${API_BASE}/accounts`, relayBase), {
        headers: { ...authHeaders(token), Accept: 'application/json' },
    });
    const result = await parseEnvelope<CloudflareAccount[]>(res);
    return result.map(a => ({ id: a.id, name: a.name }));
}

/** Uploads a Worker script via the multipart "modules" format (ES module). */
export async function deployWorker(
    token: string,
    accountId: string,
    scriptName: string,
    scriptSource: string,
    relayBase: string,
): Promise<void> {
    const metadata = {
        main_module: 'worker.mjs',
        compatibility_date: COMPAT_DATE,
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append(
        'worker.mjs',
        new Blob([scriptSource], { type: 'application/javascript+module' }),
        'worker.mjs',
    );

    const res = await fetch(
        relayUrl(`${API_BASE}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}`, relayBase),
        { method: 'PUT', headers: authHeaders(token), body: form },
    );
    await parseEnvelope<unknown>(res);
}

/** Enables the auto-assigned *.workers.dev route; without it the script is unreachable. */
export async function enableWorkersDevRoute(
    token: string,
    accountId: string,
    scriptName: string,
    relayBase: string,
): Promise<void> {
    const res = await fetch(
        relayUrl(`${API_BASE}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`, relayBase),
        {
            method: 'POST',
            headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true }),
        },
    );
    await parseEnvelope<unknown>(res);
}

/** Returns the account's workers.dev subdomain, or '' if none has been created yet. */
export async function getWorkersSubdomain(
    token: string,
    accountId: string,
    relayBase: string,
): Promise<string> {
    const res = await fetch(
        relayUrl(`${API_BASE}/accounts/${encodeURIComponent(accountId)}/workers/subdomain`, relayBase),
        { headers: { ...authHeaders(token), Accept: 'application/json' } },
    );
    const result = await parseEnvelope<{ subdomain?: string }>(res);
    return result.subdomain ?? '';
}

export function buildWorkerWssUrl(scriptName: string, subdomain: string): string {
    return `wss://${scriptName}.${subdomain}.workers.dev`;
}
