import { beforeEach, describe, expect, test, vi } from 'vitest';

// The NPC store is a heavy IndexedDB-backed singleton; stub it so the bridge can
// be tested in isolation via a captured subscribe callback.
const { subscribeMock, refreshMock } = vi.hoisted(() => ({
    subscribeMock: vi.fn(),
    refreshMock: vi.fn(),
}));

vi.mock('@web/dataStores/npcStore', () => ({
    subscribe: subscribeMock,
    refresh: refreshMock,
}));

function makeClient() {
    return { sendCommand: vi.fn(), sendEvent: vi.fn() };
}

// Fresh eventBus singleton per test (avoids listener accumulation across tests).
async function loadFresh() {
    vi.resetModules();
    const eventBus = (await import('@modules/core/eventBus')).default as any;
    const bridges = await import('@web/clientBootstrapBridges');
    return { eventBus, ...bridges };
}

describe('clientBootstrap bridges', () => {
    beforeEach(() => {
        subscribeMock.mockReset();
        refreshMock.mockReset();
    });

    describe('bridgeSendCommand', () => {
        test('forwards command, echo, and options to the client', async () => {
            const { eventBus, bridgeSendCommand } = await loadFresh();
            const client = makeClient();
            bridgeSendCommand(client as any);

            eventBus.emit('sendCommand', { command: 'polnoc', echo: false, options: { preserveCase: true } });

            expect(client.sendCommand).toHaveBeenCalledWith('polnoc', false, { preserveCase: true });
        });

        test('defaults echo to true when omitted', async () => {
            const { eventBus, bridgeSendCommand } = await loadFresh();
            const client = makeClient();
            bridgeSendCommand(client as any);

            eventBus.emit('sendCommand', { command: 'zabij smoka' });

            expect(client.sendCommand).toHaveBeenCalledWith('zabij smoka', true, undefined);
        });

        test('ignores a non-string command', async () => {
            const { eventBus, bridgeSendCommand } = await loadFresh();
            const client = makeClient();
            bridgeSendCommand(client as any);

            eventBus.emit('sendCommand', { command: undefined });

            expect(client.sendCommand).not.toHaveBeenCalled();
        });
    });

    describe('bridgeNpcStore', () => {
        test('primes the store with a refresh and mirrors snapshots to the npc event', async () => {
            const { bridgeNpcStore } = await loadFresh();
            const client = makeClient();
            bridgeNpcStore(client as any);

            expect(refreshMock).toHaveBeenCalledTimes(1);

            const onSnapshot = subscribeMock.mock.calls[0][0];
            onSnapshot({
                all: {
                    data: [
                        { name: 'Zbrojmistrz', loc: 5, source: 'remote' },
                        { name: 'Kowal', loc: 7, source: 'local' },
                    ],
                },
            });

            expect(client.sendEvent).toHaveBeenCalledWith('npc', [
                { name: 'Zbrojmistrz', loc: 5 },
                { name: 'Kowal', loc: 7 },
            ]);
        });

        test('sends an empty array for a null snapshot', async () => {
            const { bridgeNpcStore } = await loadFresh();
            const client = makeClient();
            bridgeNpcStore(client as any);

            const onSnapshot = subscribeMock.mock.calls[0][0];
            onSnapshot(null);

            expect(client.sendEvent).toHaveBeenCalledWith('npc', []);
        });
    });
});
