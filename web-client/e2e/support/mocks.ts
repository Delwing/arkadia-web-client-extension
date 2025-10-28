import type {BrowserContext, Page} from '@playwright/test';

export const GMCP_PATHS = {
    CHAR_INFO: 'char.info',
    OBJECTS_DATA: 'objects.data',
    OBJECTS_NUMS: 'objects.nums',
} as const;

export async function installMockWebSocket(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
        const sockets: MockWebSocket[] = [];
        const CONNECTING = 0;
        const OPEN = 1;
        const CLOSING = 2;
        const CLOSED = 3;

        class MockWebSocket {
            static CONNECTING = CONNECTING;
            static OPEN = OPEN;
            static CLOSING = CLOSING;
            static CLOSED = CLOSED;

            url: string;
            readyState: number;
            onopen: ((event: Event) => void) | null = null;
            onmessage: ((event: MessageEvent<string>) => void) | null = null;
            onclose: ((event: CloseEvent) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;
            sent: string[] = [];

            constructor(url: string, _protocols?: string | string[]) {
                this.url = url;
                this.readyState = CONNECTING;
                sockets.push(this);
                setTimeout(() => {
                    this.readyState = OPEN;
                    this.onopen?.(new Event('open'));
                });
            }

            send(message: string) {
                this.sent.push(message);
            }

            close() {
                if (this.readyState === CLOSED) {
                    return;
                }
                this.readyState = CLOSED;
                this.onclose?.({
                    code: 1000,
                    reason: '',
                    wasClean: true,
                } as CloseEvent);
            }

            receive(data: string) {
                if (!this.onmessage) {
                    return;
                }
                this.onmessage({
                    data,
                } as MessageEvent<string>);
            }
        }

        (window as any).__mockSockets = sockets;
        (window as any).__MockWebSocket = MockWebSocket;
        window.WebSocket = MockWebSocket as unknown as typeof WebSocket;

        const IAC = String.fromCharCode(255);
        const SB = String.fromCharCode(250);
        const SE = String.fromCharCode(240);
        const GMCP = String.fromCharCode(201);

        (window as any).__npcReady = false;
        window.addEventListener('npc', (event: Event) => {
            const detail = (event as CustomEvent)?.detail;
            if (Array.isArray(detail) && detail.length > 0) {
                (window as any).__npcReady = true;
            }
        });

        const getGameSocket = () => {
            return (
                sockets
                    .slice()
                    .reverse()
                    .find((item) => typeof item?.url === 'string' && item.url.includes('arkadia.rpg.pl')) ??
                sockets[sockets.length - 1]
            );
        };

        const normalizeLines = (value: string) => {
            const input = typeof value === 'string' ? value : String(value ?? '');
            const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const hasTrailingNewline = /\n$/.test(normalized);
            const parts = normalized.split('\n');
            const joined = parts.join('\r\n');
            return hasTrailingNewline ? `${joined}\r\n` : joined;
        };

        (window as any).__pushGmcp = (path: string, payload: unknown) => {
            const socket = getGameSocket();
            if (!socket) {
                throw new Error('No mock socket connected');
            }
            const serialized = JSON.stringify(payload ?? {});
            const message = `${IAC}${SB}${GMCP}${path} ${serialized}${IAC}${SE}`;
            const encoded = btoa(message);
            socket.receive(encoded);
        };

        (window as any).__pushIncoming = (text: string) => {
            const socket = getGameSocket();
            if (!socket) {
                throw new Error('No mock socket connected');
            }
            const normalized = normalizeLines(text);
            const encoded = btoa(normalized);
            socket.receive(encoded);
        };
    });
}

const NPC_DATA_ROUTE = '**/arkadia-mapa/data/npc.json';
const DEFAULT_NPC_DATA = [
    {name: 'Borgaf Kriegmann', loc: 200},
];

export async function mockNpcDownload(
    context: BrowserContext,
    data: {name: string; loc: number}[] = DEFAULT_NPC_DATA,
): Promise<void> {
    await context.addInitScript(() => {
        try {
            const request = indexedDB.deleteDatabase('ArkadiaNpcDB');
            request.onerror = () => {
                console.warn('Failed to clear ArkadiaNpcDB before tests');
            };
        } catch (error) {
            console.warn('Error clearing ArkadiaNpcDB before tests:', error);
        }
    });
    await context.route(NPC_DATA_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(data),
        });
    });
}

export async function waitForClientReady(page: Page): Promise<void> {
    await page.waitForFunction(() => Boolean((window as any).clientExtension));
    await page.waitForFunction(() => Array.isArray((window as any).__mockSockets) && (window as any).__mockSockets.length > 0);

    const overlay = page.locator('#auth-overlay');
    if (await overlay.isVisible()) {
        const closeButton = overlay.locator('#auth-close');
        if (await closeButton.count()) {
            await closeButton.click();
        } else {
            await page.evaluate(() => {
                const element = document.getElementById('auth-overlay');
                if (element) {
                    element.style.display = 'none';
                }
            });
        }
        await overlay.waitFor({ state: 'hidden' });
    }

    await page.waitForFunction(() => {
        const client: any = (window as any).clientExtension;
        if (!client) {
            return false;
        }
        if ((window as any).__npcReady) {
            return true;
        }
        const helper = client.packageHelper;
        if (helper && helper.npc && Object.keys(helper.npc).length > 0) {
            (window as any).__npcReady = true;
            return true;
        }
        return false;
    });
}

export async function pushGmcp(page: Page, path: string, payload: unknown): Promise<void> {
    await page.evaluate(([gmcpPath, data]) => {
        (window as any).__pushGmcp(gmcpPath, data);
    }, [path, payload]);
}

const OUTPUT_PRIME_PADDING = `${Array.from({ length: 40 }, () => '.').join('\n')}\n`;

export async function ensureGameSocket(page: Page): Promise<void> {
    await page.evaluate(() => {
        const adapter: any = (window as any).clientExtension?.clientAdapter;
        if (adapter?.connect) {
            adapter.connect();
        }
    });
    await page.waitForFunction(() => {
        const sockets: any[] = (window as any).__mockSockets ?? [];
        return sockets.some((socket) => typeof socket?.url === 'string' && socket.url.includes('arkadia.rpg.pl'));
    });

    const alreadyPrimed = await page.evaluate(() => Boolean((window as any).__outputPrimed));
    if (!alreadyPrimed) {
        await pushText(page, OUTPUT_PRIME_PADDING);
        await page.evaluate(() => {
            (window as any).__outputPrimed = true;
        });
    }
}

export async function pushText(page: Page, text: string): Promise<void> {
    await page.evaluate(([payload]) => {
        (window as any).__pushIncoming(payload);
    }, [text]);
    await page.evaluate(() => {
        const adapter = (window as any).clientExtension?.clientAdapter as any;
        if (!adapter || typeof adapter.flushMessageBuffer !== 'function') {
            throw new Error('Arkadia client is not ready');
        }
        adapter.flushMessageBuffer();
    });
}

export type EmbeddedCall = { method: string; value?: unknown };

export async function installEmbeddedMock(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
        const recordCall = (method: string, value?: unknown) => {
            const store = (window as any).__embeddedCalls;
            if (Array.isArray(store)) {
                store.push({ method, value });
            }
        };

        (window as any).__embeddedCalls = [];
        (window as any).embedded = {
            renderer: {},
            setZoom(value: number) {
                recordCall('setZoom', value);
            },
            setExplorationMode(value: boolean) {
                recordCall('setExplorationMode', value);
            },
            setInstantMove(value: boolean) {
                recordCall('setInstantMove', value);
            },
            setHighlightCurrentRoom(value: boolean) {
                recordCall('setHighlightCurrentRoom', value);
            },
            setTransparentLabels(value: boolean) {
                recordCall('setTransparentLabels', value);
            },
            setLabelRenderMode(value: 'image' | 'data') {
                recordCall('setLabelRenderMode', value);
            },
            refresh() {
                recordCall('refresh');
            },
            getVisitedCount() {
                return 0;
            },
            getRoomCount() {
                return 0;
            },
        };
    });
}

export async function resetEmbeddedCalls(page: Page): Promise<void> {
    await page.evaluate(() => {
        (window as any).__embeddedCalls = [];
    });
}

export async function getEmbeddedCalls(page: Page): Promise<EmbeddedCall[]> {
    return await page.evaluate(() => (window as any).__embeddedCalls ?? []);
}

export type MultibindWorkerResponse =
    | { type: 'success'; payload: { rows: unknown[]; totalRows: number; invalidRows: number } }
    | { type: 'error'; message: string };

export async function installMultibindWorkerMock(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
        const queuedResponses: any[] = [];
        const capturedRequests: any[] = [];

        class MockWorker {
            url: string;
            options?: WorkerOptions;
            onmessage: ((event: MessageEvent<any>) => void) | null = null;
            onerror: ((event: ErrorEvent) => void) | null = null;
            private messageListeners = new Set<(event: MessageEvent<any>) => void>();
            private errorListeners = new Set<(event: ErrorEvent) => void>();

            constructor(url: string | URL, options?: WorkerOptions) {
                this.url = typeof url === 'string' ? url : url.toString();
                this.options = options;
            }

            postMessage(data: any, _transfer?: Transferable[]) {
                capturedRequests.push(data);
                const response = queuedResponses.shift();
                if (!response) {
                    setTimeout(() => {
                        const errorEvent = new ErrorEvent('error', { message: 'No queued multibind worker response' });
                        this.dispatchError(errorEvent);
                    });
                    return;
                }
                setTimeout(() => {
                    if (response.type === 'error' && response.message !== undefined) {
                        const event = { data: { type: 'error', message: response.message } } as MessageEvent<any>;
                        this.dispatchMessage(event);
                        return;
                    }
                    const event = { data: response } as MessageEvent<any>;
                    this.dispatchMessage(event);
                });
            }

            addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
                if (type === 'message') {
                    const fn = listener as (event: MessageEvent<any>) => void;
                    this.messageListeners.add(fn);
                } else if (type === 'error') {
                    const fn = listener as (event: ErrorEvent) => void;
                    this.errorListeners.add(fn);
                }
            }

            removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
                if (type === 'message') {
                    const fn = listener as (event: MessageEvent<any>) => void;
                    this.messageListeners.delete(fn);
                } else if (type === 'error') {
                    const fn = listener as (event: ErrorEvent) => void;
                    this.errorListeners.delete(fn);
                }
            }

            terminate() {
                // no-op for mock
            }

            private dispatchMessage(event: MessageEvent<any>) {
                this.messageListeners.forEach((listener) => listener(event));
                this.onmessage?.(event);
            }

            private dispatchError(event: ErrorEvent) {
                this.errorListeners.forEach((listener) => listener(event));
                this.onerror?.(event);
            }
        }

        Object.defineProperty(window, 'Worker', {
            configurable: true,
            writable: true,
            value: MockWorker,
        });

        (window as any).__queueMultibindResponse = (response: any) => {
            queuedResponses.push(response);
        };
        (window as any).__getMultibindRequests = () => capturedRequests.slice();
    });
}

export async function queueMultibindResponse(page: Page, response: MultibindWorkerResponse): Promise<void> {
    await page.evaluate(([payload]) => {
        (window as any).__queueMultibindResponse(payload);
    }, [response]);
}

export async function getMultibindRequests(page: Page): Promise<any[]> {
    return await page.evaluate(() => (window as any).__getMultibindRequests?.() ?? []);
}
