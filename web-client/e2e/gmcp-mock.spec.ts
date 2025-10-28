import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';

const GMCP_PATHS = {
    CHAR_INFO: 'char.info',
    OBJECTS_DATA: 'objects.data',
    OBJECTS_NUMS: 'objects.nums',
} as const;

async function waitForClientReady(page: Page) {
    await page.waitForFunction(() => Boolean((window as any).clientExtension));
    await page.waitForFunction(() => Array.isArray((window as any).__mockSockets) && (window as any).__mockSockets.length > 0);
}

async function pushGmcp(page: Page, path: string, payload: unknown) {
    await page.evaluate(([gmcpPath, data]) => {
        (window as any).__pushGmcp(gmcpPath, data);
    }, [path, payload]);
}

async function ensureGameSocket(page: Page) {
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
}

test.beforeEach(async ({context}) => {
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

        (window as any).__pushGmcp = (path: string, payload: unknown) => {
            const socket = sockets
                .slice()
                .reverse()
                .find((item) => typeof item?.url === 'string' && item.url.includes('arkadia.rpg.pl'))
                ?? sockets[sockets.length - 1];
            if (!socket) {
                throw new Error('No mock socket connected');
            }
            const serialized = JSON.stringify(payload ?? {});
            const message = `${IAC}${SB}${GMCP}${path} ${serialized}${IAC}${SE}`;
            const encoded = btoa(message);
            socket.receive(encoded);
        };
    });
});

test.describe('GMCP-driven interactions', () => {
    test('renders team members and leader from GMCP updates', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        const attemptedUrls = await page.evaluate(() => {
            const sockets: any[] = (window as any).__mockSockets ?? [];
            return sockets.map((socket) => socket?.url);
        });
        expect(attemptedUrls.some((url: string | null | undefined) => typeof url === 'string' && url.includes('arkadia.rpg.pl'))).toBe(true);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: true },
            '101': { desc: 'Scout', team: true, state: 4 },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 101]);

        const teamMembers = page.locator('#objects-list .object-desc[data-teammate="true"]');
        await expect(teamMembers).toHaveCount(1);
        await expect(teamMembers.first()).toContainText('Scout');

        const shortcuts = page.locator('#objects-list .object-num');
        await expect(shortcuts.first()).toContainText('A');
    });

    test('removes enemies when they disappear from GMCP objects.nums', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 200 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '200': { desc: 'Player', team: true, team_leader: true },
            '300': { desc: 'Goblin Scout', attack_num: 1 },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [200, 300]);

        await page.waitForFunction(() => {
            const client: any = (window as any).clientExtension;
            const objects = client?.ObjectManager?.getObjectsOnLocation?.();
            if (!Array.isArray(objects)) {
                return false;
            }
            return objects.some((obj: any) => obj?.desc === 'Goblin Scout');
        });

        const enemies = page.locator('#objects-list .object-desc').filter({ hasText: 'Goblin Scout' });
        await expect(enemies).toHaveCount(1);

        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [200]);
        await expect(enemies).toHaveCount(0);
    });
});
