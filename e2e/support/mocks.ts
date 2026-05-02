import type {BrowserContext, Page} from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';
import {execSync} from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GMCP_PATHS = {
    CHAR_INFO: 'char.info',
    OBJECTS_DATA: 'objects.data',
    OBJECTS_NUMS: 'objects.nums',
    ROOM_INFO: 'room.info',
} as const;

export async function installMockWebSocket(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
        const globalScope: any = window;
        const sockets: MockWebSocket[] = [];
        const commandLog: string[] = [];

        const CONNECTING = 0;
        const OPEN = 1;
        const CLOSING = 2;
        const CLOSED = 3;

        const decodeCommand = (message: string): string | null => {
            try {
                const decoded = atob(message);
                if (!decoded || decoded.charCodeAt(0) === 255) {
                    return null;
                }
                const trimmed = decoded.replace(/\r?\n/g, '').trim();
                return trimmed || null;
            } catch (_error) {
                return null;
            }
        };

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
            commands: string[] = [];

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
                const command = decodeCommand(message);
                if (command) {
                    if (this.commands[this.commands.length - 1] !== command) {
                        this.commands.push(command);
                    }
                    if (commandLog[commandLog.length - 1] !== command) {
                        commandLog.push(command);
                    }
                }
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
                this.onmessage?.({ data } as MessageEvent<string>);
            }
        }

        const IAC = String.fromCharCode(255);
        const SB = String.fromCharCode(250);
        const SE = String.fromCharCode(240);
        const GMCP = String.fromCharCode(201);

        const normalizeLines = (value: string) => {
            const input = typeof value === 'string' ? value : String(value ?? '');
            const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const hasTrailingNewline = /\n$/.test(normalized);
            const parts = normalized.split('\n');
            const joined = parts.join('\r\n');
            return hasTrailingNewline ? `${joined}\r\n` : joined;
        };

        const getGameSocket = () => {
            return (
                sockets
                    .slice()
                    .reverse()
                    .find((item) => typeof item?.url === 'string' && item.url.includes('arkadia.rpg.pl')) ??
                sockets[sockets.length - 1]
            );
        };

        const resetCommandLog = () => {
            commandLog.length = 0;
            sockets.forEach((socket) => {
                if (Array.isArray(socket?.commands)) {
                    socket.commands.length = 0;
                }
            });
        };

        globalScope.__mockSockets = sockets;
        globalScope.__MockWebSocket = MockWebSocket;
        globalScope.__mockCommandLog = commandLog;
        globalScope.__resetCommandLog = resetCommandLog;
        globalScope.WebSocket = MockWebSocket as unknown as typeof WebSocket;

        globalScope.__pushGmcp = (path: string, payload: unknown) => {
            const socket = getGameSocket();
            if (!socket) {
                throw new Error('No mock socket connected');
            }
            const serialized = JSON.stringify(payload ?? {});
            const message = `${IAC}${SB}${GMCP}${path} ${serialized}${IAC}${SE}`;
            const encoded = btoa(message);
            socket.receive(encoded);
        };

        globalScope.__pushIncoming = (text: string) => {
            const socket = getGameSocket();
            if (!socket) {
                throw new Error('No mock socket connected');
            }
            const normalized = normalizeLines(text);
            const encoded = btoa(normalized);
            socket.receive(encoded);
        };

        globalScope.__pushText = (text: string, type: string) => {
            const normalized = normalizeLines(text);
            globalScope.__pushGmcp('gmcp_msgs', {
                type,
                text: btoa(normalized),
            });
        };
    });
}

export async function primeCharInfo(
    page: Page,
    data: {name: string} = {name: 'Tester'},
): Promise<void> {
    await pushGmcp(page, 'char.info', data);
}

type MockMapRoom = {
    area: number;
    x: number;
    y: number;
    z: number;
    weight: number;
    name: string;
    rawSpecialExits: Record<string, unknown>;
    symbol: string;
    userData: Record<string, unknown>;
    customLines: Record<string, unknown>;
    stubs: unknown[];
    doors: Record<string, unknown>;
    id: number;
    env: number;
    exits: Record<string, number>;
    specialExits: Record<string, unknown>;
    hash: string;
};

type MockMapArea = {
    areaName: string;
    areaId: string;
    rooms: MockMapRoom[];
    labels: unknown[];
};

type MockMapData = MockMapArea[];

type MockMapColor = {
    envId: number;
    colors: [number, number, number];
};

const MAP_DATA_ROUTE = '**/arkadia-mapa/data/mapExport.json';
const MAP_COLORS_ROUTE = '**/arkadia-mapa/data/colors.json';
const MAP_RELEASE_ROUTE = 'https://api.github.com/repos/Delwing/arkadia-mapa/releases/latest';
const NPC_DATA_ROUTE = '**/arkadia-mapa/data/npc.json';
const PEOPLE_DB_ROUTE = '**/arkadia-people.delwing.workers.dev/download';
const KNOWLEDGE_DATA_ROUTE = '**/knowledge_data.json';
const WIEDZA_API_ROUTE = '**/admin-ajax.php?action=wiedza_data';
const MAGICS_DATA_ROUTE = '**/magics_data.json';
const MAGIC_KEYS_DATA_ROUTE = '**/magic_keys.json';
const GITHUB_DEPLOYMENTS_ROUTE = 'https://api.github.com/repos/Delwing/arkadia-web-client-extension/deployments?environment=github-pages';

// Get the current commit SHA dynamically
function getCurrentCommitSha(): string {
    try {
        const sha = execSync('git rev-parse --short HEAD').toString().trim();
        // Pad to 40 chars to match GitHub API format
        return sha + '1234567890123456789012345678901234'.substring(0, 40 - sha.length);
    } catch {
        return 'unknown1234567890123456789012345678901';
    }
}

const DEFAULT_MAP_DATA: MockMapData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'mock-data', 'map-data.json'), 'utf-8')
);

const DEFAULT_MAP_COLORS: MockMapColor[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'mock-data', 'map-colors.json'), 'utf-8')
);

const DEFAULT_NPC_DATA = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'mock-data', 'npc-data.json'), 'utf-8')
);

// Contains a tiny SQLite database with a single `people` table. The rows use
// guild identifiers defined in `scripts/generate-people.mjs` so tests can map
// them to short guild codes:
// - Aldous (guild 1 → CKN), description "Wysoki wojownik"
// - Berenika (guild 8 → SGW), description "Cicha zabojczyni"
// - Cedric (guild 12 → KG), description "Kupiec wedrowny"
// - Dagna (guild 16 → RA), description "Przewodniczka gorska"
// - Eryk (guild 21 → NPC), description "Obronca Arkadii"
const DEFAULT_PEOPLE_DB_BASE64 = fs.readFileSync(
    path.join(__dirname, 'mock-data', 'people-database.txt'),
    'utf-8'
).trim();

const DEFAULT_MAGICS_DATA = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'mock-data', 'magics-data.json'), 'utf-8')
);

const DEFAULT_MAGIC_KEYS_DATA = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'mock-data', 'magic-keys-data.json'), 'utf-8')
);

const DEFAULT_KNOWLEDGE_DATA = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'mock-data', 'knowledge-data.json'), 'utf-8')
);

const DEFAULT_WIEDZA_DATA = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'mock-data', 'wiedza-data.json'), 'utf-8')
);

export async function mockMapDownloads(
    context: BrowserContext,
    options: {mapData?: MockMapData; colorsData?: MockMapColor[]} = {},
): Promise<void> {
    const mapData = options.mapData ?? DEFAULT_MAP_DATA;
    const colorsData = options.colorsData ?? DEFAULT_MAP_COLORS;

    await context.route(MAP_DATA_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mapData),
        });
    });

    await context.route(MAP_COLORS_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(colorsData),
        });
    });
}

export async function mockMapReleaseVersion(
    context: BrowserContext,
    options: {tagName?: string} = {},
): Promise<void> {
    const tagName = options.tagName ?? '0.160.0';

    await context.route(MAP_RELEASE_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                tag_name: tagName,
                name: `Release ${tagName}`,
                published_at: new Date().toISOString(),
            }),
        });
    });
}

export async function mockNpcDownload(
    context: BrowserContext,
    data: {name: string; loc: number}[] = DEFAULT_NPC_DATA,
): Promise<void> {
    await context.route(NPC_DATA_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(data),
        });
    });
}

export async function mockPeopleDownload(
    context: BrowserContext,
    options: {databaseBase64?: string} = {},
): Promise<void> {
    const body = options.databaseBase64 ?? DEFAULT_PEOPLE_DB_BASE64;

    await context.route(PEOPLE_DB_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/octet-stream',
            body: Buffer.from(body, 'base64'),
        });
    });
}

export async function mockKnowledgeDownload(
    context: BrowserContext,
    data: {
        version?: number;
        books: Record<string, {mianownik: string; dopelniacz: string; biernik: string; categories: string[]}>;
        libraries: Record<string, {location_id: string; categories: string[]; name: string}>;
    } = DEFAULT_KNOWLEDGE_DATA,
): Promise<void> {
    await context.route(KNOWLEDGE_DATA_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(data),
        });
    });
}

export async function mockWiedzaDownload(
    context: BrowserContext,
    data: {
        success: boolean;
        data: {
            data: unknown[];
        };
    } = DEFAULT_WIEDZA_DATA,
): Promise<void> {
    await context.route(WIEDZA_API_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(data),
        });
    });
}

export async function mockMagicsDownload(
    context: BrowserContext,
    data: {magics: Record<string, {regexps?: string[]}>} = DEFAULT_MAGICS_DATA,
): Promise<void> {
    await context.route(MAGICS_DATA_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(data),
        });
    });
}

export async function mockMagicKeysDownload(
    context: BrowserContext,
    data: {magic_keys: string[]} = DEFAULT_MAGIC_KEYS_DATA,
): Promise<void> {
    await context.route(MAGIC_KEYS_DATA_ROUTE, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(data),
        });
    });
}

// Export for use in tests
export {getCurrentCommitSha};

export async function mockGithubDeployments(
    context: BrowserContext,
    options: {sha?: string; returnCurrent?: boolean; simulateRateLimit?: boolean} = {},
): Promise<void> {
    await context.route(GITHUB_DEPLOYMENTS_ROUTE, async (route) => {
        if (options.simulateRateLimit) {
            // Simulate rate limiting
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'API rate limit exceeded',
                }),
            });
            return;
        }

        // Return the specified SHA or the current commit SHA so tests don't show false warnings
        // The first deployment in the array is the most recent
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    sha: options.sha || getCurrentCommitSha(),
                    environment: 'github-pages',
                },
            ]),
        });
    });
}

export async function waitForCommandInput(page: Page): Promise<void> {
    const overlay = page.locator('#auth-overlay');
    if ((await overlay.count()) > 0 && (await overlay.isVisible())) {
        await page.keyboard.press('Escape');
        try {
            await overlay.waitFor({state: 'hidden', timeout: 2000});
        } catch {
            await page.evaluate(() => {
                const element = document.getElementById('auth-overlay');
                if (element) {
                    element.style.display = 'none';
                }
            });
            await overlay.waitFor({state: 'hidden'});
        }
    }

    await page.locator('#message-input').waitFor({state: 'visible'});
    await page.waitForFunction(() => {
        const element = document.querySelector<HTMLInputElement>('#message-input');
        return Boolean(element && !element.disabled);
    });
}

export async function waitForMapReady(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const mapElement = document.querySelector('#map');
        if (!mapElement) return false;

        // Konva creates multiple canvases, check if any have content
        const canvases = mapElement.querySelectorAll<HTMLCanvasElement>('canvas');
        if (canvases.length === 0) return false;

        // Check that at least one canvas has non-zero dimensions
        return Array.from(canvases).some(canvas => canvas.width > 0 && canvas.height > 0);
    }, {timeout: 10000});
}

export async function pushGmcp(page: Page, path: string, payload: unknown): Promise<void> {
    await page.waitForFunction(() => typeof (window as any).__pushGmcp === 'function');
    await page.evaluate(([gmcpPath, data]) => {
        (window as any).__pushGmcp(gmcpPath, data);
    }, [path, payload]);
}

const OUTPUT_PRIME_PADDING = `${Array.from({ length: 40 }, () => '.').join('\n')}\n`;

export async function ensureGameSocket(page: Page): Promise<void> {
    // Wait for mock WebSocket to be installed
    await page.waitForFunction(
        () => typeof (window as any).__mockSockets !== 'undefined',
        {timeout: 10000}
    );

    // Check if already connected
    const alreadyConnected = await page.evaluate(() => {
        const sockets: any[] = (window as any).__mockSockets ?? [];
        return sockets.some((socket) => typeof socket?.url === 'string' && socket.url.includes('arkadia.rpg.pl'));
    });

    if (!alreadyConnected) {
        // Race both buttons and auto-connect in parallel to avoid sequential 5s+5s timeouts
        const autoConnect = page.waitForFunction(
            () => {
                const sockets: any[] = (window as any).__mockSockets ?? [];
                return sockets.some((socket) => typeof socket?.url === 'string' && socket.url.includes('arkadia.rpg.pl'));
            },
            {timeout: 2000}
        ).catch(() => null);

        const clickButton = Promise.race([
            page.locator('#connect-button').waitFor({state: 'visible', timeout: 2000})
                .then(() => page.locator('#connect-button').click())
                .catch(() => null),
            page.locator('#connect-button-inline').waitFor({state: 'visible', timeout: 2000})
                .then(() => page.locator('#connect-button-inline').click())
                .catch(() => null),
        ]);

        await Promise.race([autoConnect, clickButton]);
    }

    // Wait for socket connection with explicit timeout
    await page.waitForFunction(
        () => {
            const sockets: any[] = (window as any).__mockSockets ?? [];
            return sockets.some((socket) => typeof socket?.url === 'string' && socket.url.includes('arkadia.rpg.pl'));
        },
        {timeout: 5000}
    );

    await page.evaluate(() => {
        const globalScope: any = window;
        if (typeof globalScope.__resetCommandLog === 'function') {
            globalScope.__resetCommandLog();
        }
    });

    const alreadyPrimed = await page.evaluate(() => Boolean((window as any).__outputPrimed));
    if (!alreadyPrimed) {
        await pushText(page, OUTPUT_PRIME_PADDING);
        await page.evaluate(() => {
            (window as any).__outputPrimed = true;
        });
    }
}

export async function pushText(page: Page, text: string, options: { type?: string } = {}): Promise<void> {
    const type = options.type ?? 'comm';
    await page.evaluate(([payload, gmcpType]) => {
        const globalScope: any = window;
        if (typeof globalScope.__pushText !== 'function') {
            throw new Error('Mock WebSocket not initialized');
        }
        globalScope.__pushText(payload, gmcpType);
    }, [text, type]);
}

export async function submitCommand(page: Page, command: string): Promise<void> {
    const commandInput = page.locator('#message-input');
    await commandInput.focus()
    await commandInput.fill(command);
    await commandInput.press('Enter');
    await page.waitForTimeout(5)
}

export async function getLastOutgoingCommand(page: Page): Promise<string | null> {
    return await page.evaluate(() => {
        const sockets: any[] = (window as any).__mockSockets ?? [];
        for (let i = sockets.length - 1; i >= 0; i--) {
            const commands: unknown = sockets[i]?.commands;
            if (Array.isArray(commands) && commands.length > 0) {
                const last = commands[commands.length - 1];
                if (typeof last === 'string' && last.trim()) {
                    return last.trim();
                }
            }
        }
        const log: unknown = (window as any).__mockCommandLog;
        if (Array.isArray(log) && log.length > 0) {
            const value = log[log.length - 1];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return null;
    });
}

export type EmbeddedCall = { method: string; value?: unknown };

export async function installEmbeddedMock(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
        const METHOD_NAMES = [
            'setZoom',
            'setExplorationMode',
            'setInstantMove',
            'setHighlightCurrentRoom',
            'setTransparentLabels',
            'setLabelRenderMode',
            'refresh',
        ];

        const EMBEDDED_FLAG = '__arkadiaEmbeddedProxy__';

        const recordCall = (method: string, value?: unknown) => {
            const store = (window as any).__embeddedCalls;
            if (Array.isArray(store)) {
                store.push({ method, value });
            }
        };

        const wrapEmbedded = (target: any) => {
            if (target && typeof target === 'object' && target[EMBEDDED_FLAG]) {
                return target;
            }

            const original = target && typeof target === 'object' ? target : {};
            if (!original.renderer) {
                original.renderer = {};
            }

            const methodWrappers: Record<string, (...args: any[]) => unknown> = {};
            for (const name of METHOD_NAMES) {
                const originalFn = typeof original[name] === 'function' ? original[name].bind(original) : undefined;
                methodWrappers[name] = (...args: any[]) => {
                    recordCall(name, args[0]);
                    if (originalFn) {
                        return originalFn(...args);
                    }
                    return undefined;
                };
            }

            const proxy = new Proxy(original, {
                get(target, prop, receiver) {
                    if (prop === 'renderer') {
                        return target.renderer ?? {};
                    }
                    if (prop in methodWrappers) {
                        return methodWrappers[prop as keyof typeof methodWrappers];
                    }
                    return Reflect.get(target, prop, receiver);
                },
                set(target, prop, value, receiver) {
                    const result = Reflect.set(target, prop, value, receiver);
                    if (METHOD_NAMES.includes(String(prop))) {
                        const bound = typeof value === 'function' ? value.bind(target) : undefined;
                        methodWrappers[String(prop)] = (...args: any[]) => {
                            recordCall(String(prop), args[0]);
                            if (bound) {
                                return bound(...args);
                            }
                            return undefined;
                        };
                    }
                    if (prop === 'renderer' && !target.renderer) {
                        target.renderer = value;
                    }
                    return result;
                },
            });

            try {
                Object.defineProperty(original, EMBEDDED_FLAG, {
                    configurable: true,
                    value: true,
                });
            } catch (_error) {
                // ignore if property definition fails
            }

            return proxy;
        };

        (window as any).__embeddedCalls = [];

        const initialEmbeddedValue = (window as any).embedded;

        const setEmbeddedValue = (value: any) => {
            embeddedValue = wrapEmbedded(value);
        };

        let embeddedValue: any;

        Object.defineProperty(window, 'embedded', {
            configurable: true,
            get() {
                return embeddedValue;
            },
            set(value) {
                setEmbeddedValue(value);
            },
        });

        setEmbeddedValue(initialEmbeddedValue);

        if (!initialEmbeddedValue) {
            setEmbeddedValue({});
        }
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

export async function waitForOutputContaining(page: Page, text: string, timeout: number = 5000): Promise<void> {
    await page.waitForFunction(
        (searchText) => {
            const wrapper = document.querySelector('#main_text_output_msg_wrapper');
            if (!wrapper) return false;

            const messages = wrapper.querySelectorAll('.output_msg');
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 20); i--) {
                const msg = messages[i];
                const textContent = msg.textContent || '';
                if (textContent.includes(searchText)) {
                    return true;
                }
            }
            return false;
        },
        text,
        {timeout}
    );
}

export async function getRecentOutput(page: Page, count: number = 10): Promise<string> {
    return await page.evaluate((numMessages) => {
        const wrapper = document.querySelector('#main_text_output_msg_wrapper');
        if (!wrapper) return '';

        const messages = wrapper.querySelectorAll('.output_msg');
        if (messages.length === 0) return '';

        const result: string[] = [];
        const startIdx = Math.max(0, messages.length - numMessages);

        for (let i = startIdx; i < messages.length; i++) {
            result.push(messages[i].textContent?.trim() || '');
        }

        return result.join('\n');
    }, count);
}

export async function waitForCharacter(page: Page, name: string, timeout: number = 5000): Promise<void> {
    await page.waitForFunction(
        (charName) => localStorage.getItem('currentCharacter') === charName,
        name,
        {timeout}
    );
}

export async function getCommandLog(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
        const log: unknown = (window as any).__mockCommandLog;
        return Array.isArray(log) ? log.slice() : [];
    });
}

export async function resetCommandLog(page: Page): Promise<void> {
    await page.evaluate(() => {
        const globalScope: any = window;
        if (typeof globalScope.__resetCommandLog === 'function') {
            globalScope.__resetCommandLog();
        }
    });
}
