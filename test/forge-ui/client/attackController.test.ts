import { beforeEach, describe, expect, it } from 'vitest';
import { getAttackController } from '../../../forge-ui/client/attackController';
import type Client from '@client/Client';

function makeFakeClient(): Client {
    return {
        on: jest.fn(() => () => {}),
        sendEvent: jest.fn(),
        sendCommand: jest.fn(),
        ObjectManager: { getObjectsOnLocation: jest.fn(() => []) },
        TeamManager: { isLeader: jest.fn(() => false), getLeaderId: jest.fn(() => undefined) },
    } as unknown as Client;
}

describe('getAttackController', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns the same controller instance for the same client', () => {
        const client = makeFakeClient();
        const first = getAttackController(client);
        const second = getAttackController(client);

        expect(first).toBe(second);
    });

    it('builds the controller exactly once per client (createAttackController side effect fires once)', () => {
        const client = makeFakeClient();
        getAttackController(client);
        getAttackController(client);
        getAttackController(client);

        // createAttackController emits an initial attackMode sendEvent exactly once.
        expect((client.sendEvent as ReturnType<typeof jest.fn>)).toHaveBeenCalledTimes(1);
    });

    it('returns a distinct controller for a different client', () => {
        const clientA = makeFakeClient();
        const clientB = makeFakeClient();

        const controllerA = getAttackController(clientA);
        const controllerB = getAttackController(clientB);

        expect(controllerA).not.toBe(controllerB);
        expect((clientA.sendEvent as ReturnType<typeof jest.fn>)).toHaveBeenCalledTimes(1);
        expect((clientB.sendEvent as ReturnType<typeof jest.fn>)).toHaveBeenCalledTimes(1);
    });

    it('exposes the attack/support API surface', () => {
        const client = makeFakeClient();
        const controller = getAttackController(client);

        expect(typeof controller.attackById).toBe('function');
        expect(typeof controller.attackByTarget).toBe('function');
        expect(typeof controller.attackAllEnemies).toBe('function');
        expect(typeof controller.support).toBe('function');

        controller.attackById(42);
        expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_42');
    });
});
