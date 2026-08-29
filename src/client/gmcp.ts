export const gmcp: Record<string, any> = (globalThis as any).gmcp || ((globalThis as any).gmcp = {});

export function setGmcp(path: string, value: any) {
    const parts = path.split('.');
    let obj: any = gmcp;
    for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]] = obj[parts[i]] || {};
    }
    obj[parts[parts.length - 1]] = value;
}

type GmcpPayload = { path?: string; value?: unknown };

// The server sends partial char.options updates (e.g. just the option that
// changed), so a wholesale replace would drop the other options from the
// mirror — merge key-by-key instead.
const MERGED_PATHS = new Set(['char.options']);

export function mergeGmcp(path: string, value: Record<string, unknown>) {
    const parts = path.split('.');
    let obj: any = gmcp;
    for (const part of parts) {
        obj = obj[part] = obj[part] || {};
    }
    Object.assign(obj, value);
}

export function attachGmcpListener(target: { on: (event: 'gmcp', handler: (payload: GmcpPayload) => void) => unknown }) {
    target.on('gmcp', ({ path, value }: GmcpPayload = {}) => {
        if (typeof path !== 'string') {
            return;
        }
        if (MERGED_PATHS.has(path) && value && typeof value === 'object' && !Array.isArray(value)) {
            mergeGmcp(path, value as Record<string, unknown>);
        } else {
            setGmcp(path, value);
        }
    });
}
