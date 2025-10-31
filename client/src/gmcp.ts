export const gmcp: Record<string, any> = (window as any).gmcp || ((window as any).gmcp = {});

export function setGmcp(path: string, value: any) {
    const parts = path.split('.');
    let obj: any = gmcp;
    for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]] = obj[parts[i]] || {};
    }
    obj[parts[parts.length - 1]] = value;
}

type GmcpPayload = { path?: string; value?: unknown };

export function attachGmcpListener(target: { on: (event: 'gmcp', handler: (payload: GmcpPayload) => void) => unknown }) {
    target.on('gmcp', ({ path, value }: GmcpPayload = {}) => {
        if (typeof path === 'string') {
            setGmcp(path, value);
        }
    });
}
