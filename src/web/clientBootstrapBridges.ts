import eventBus from "@modules/core/eventBus";
import type { SendCommandEvent } from "@shared/events";
import { refresh as refreshNpcStore, subscribe as subscribeNpcStore } from "./dataStores/npcStore";

/**
 * The narrow client surface the bootstrap bridges depend on. Kept minimal so the
 * bridges can be unit-tested with a plain mock instead of a full `Client`.
 */
export interface BridgeClient {
    sendCommand(command: string, echo?: boolean, options?: unknown): unknown;
    sendEvent(event: string, payload: unknown): void;
}

/**
 * Bridge the `sendCommand` event onto the client. Scripts, plugins, and UI
 * chrome emit `sendCommand` on the bus (17+ call sites, including client-side
 * `@client/PluginApi` and `@client/scripts/poczta`) rather than reaching for the
 * client directly, so every UI must install this bridge or those commands drop.
 */
export function bridgeSendCommand(client: BridgeClient): void {
    eventBus.on('sendCommand', ({ command, echo = true, options }: SendCommandEvent) => {
        if (typeof command !== 'string') {
            return;
        }
        void client.sendCommand(command, echo, options);
    });
}

/**
 * Bridge the shared NPC store onto the client: mirror every snapshot into the
 * client's `npc` event (name + location per entry) and prime it with a refresh.
 */
export function bridgeNpcStore(client: BridgeClient): void {
    subscribeNpcStore(snapshot => {
        const payload = snapshot?.all.data.map(({ name, loc }) => ({ name, loc })) ?? [];
        client.sendEvent("npc", payload);
    });
    void refreshNpcStore();
}
