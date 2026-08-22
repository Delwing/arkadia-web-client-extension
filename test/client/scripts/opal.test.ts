import { describe, test, expect, beforeEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initOpal from '@client/scripts/opal';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const UP_LOCATION = 17253;

describe('opal', () => {
    let client: Client;
    let room: { exits: Record<string, number | undefined> };

    function mapWith(history: number[]) {
        room = { exits: {} };
        Object.defineProperty(client.Map, 'locationHistory', { value: history, configurable: true });
        vi.spyOn(client.Map, 'getRoomById').mockReturnValue(room as any);
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initOpal(client);
    });

    test('descending into the cave links the up exit back where you came from', () => {
        mapWith([100, 200, UP_LOCATION]);

        client.sendEvent('enterLocation', { id: UP_LOCATION, direction: 'down' } as any);

        expect(room.exits.up).toBe(200);
    });

    test('arriving any other way leaves the exits alone', () => {
        mapWith([100, 200, UP_LOCATION]);

        client.sendEvent('enterLocation', { id: UP_LOCATION, direction: 'north' } as any);

        expect(room.exits.up).toBeUndefined();
    });

    test('another location is ignored entirely', () => {
        mapWith([100, 200, 999]);

        client.sendEvent('enterLocation', { id: 999, direction: 'down' } as any);

        expect(room.exits.up).toBeUndefined();
    });

    test('too short a history is not enough to link anything', () => {
        mapWith([UP_LOCATION]);

        client.sendEvent('enterLocation', { id: UP_LOCATION, direction: 'down' } as any);

        expect(room.exits.up).toBeUndefined();
    });
});
