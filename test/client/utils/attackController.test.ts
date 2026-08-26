import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAttackController } from '@client/utils/attackController.ts';
import type Client from '@client/Client';

type Obj = {
    num: number;
    desc?: string;
    attack_num?: boolean | number;
    __category?: 'player' | 'team' | 'rest' | 'rest-noncombat';
};

function makeClient(objects: Obj[]) {
    const sendCommand = vi.fn();
    const println = vi.fn();
    const client = {
        on: vi.fn(),
        sendEvent: vi.fn(),
        sendCommand,
        println,
        print: vi.fn(),
        ObjectManager: { getObjectsOnLocation: () => objects },
        TeamManager: { isLeader: () => false, getLeaderId: () => undefined },
    } as unknown as Client;
    return { client, sendCommand, println };
}

const attacked = (sendCommand: ReturnType<typeof vi.fn>) =>
    sendCommand.mock.calls.map(call => String(call[0]));

describe('attackAllEnemies', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('attacks objects that fight a team member', () => {
        const { client, sendCommand } = makeClient([
            { num: 1, __category: 'player' },
            { num: 2, __category: 'team' },
            { num: 3, __category: 'rest', attack_num: 1 },
            { num: 4, __category: 'rest', attack_num: 2 },
        ]);

        createAttackController(client).attackAllEnemies();

        expect(attacked(sendCommand)).toEqual(['zabij ob_3', 'zabij ob_4']);
    });

    it('attacks objects the team already fights, even out of combat', () => {
        const { client, sendCommand } = makeClient([
            { num: 1, __category: 'player', attack_num: 3 },
            { num: 3, __category: 'rest-noncombat' },
        ]);

        createAttackController(client).attackAllEnemies();

        expect(attacked(sendCommand)).toEqual(['zabij ob_3']);
    });

    it('leaves bystanders and unrelated fighters alone', () => {
        const { client, sendCommand, println } = makeClient([
            { num: 1, __category: 'player' },
            { num: 2, desc: 'Gwardzista', __category: 'rest-noncombat' },
            { num: 3, __category: 'rest', attack_num: 2 },
        ]);

        createAttackController(client).attackAllEnemies();

        expect(attacked(sendCommand)).toEqual([]);
        expect(println).toHaveBeenCalled();
    });

    it('skips allies among the team enemies', () => {
        const { client, sendCommand } = makeClient([
            { num: 1, __category: 'player' },
            { num: 5, __category: 'rest', attack_num: 1 },
            { num: 6, __category: 'rest', attack_num: 1 },
        ]);

        createAttackController(client).attackAllEnemies(id => id === 5);

        expect(attacked(sendCommand)).toEqual(['zabij ob_6']);
    });
});

describe('attackAllNonTeam', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('attacks everyone outside the team, bystanders included', () => {
        const { client, sendCommand } = makeClient([
            { num: 1, __category: 'player' },
            { num: 2, __category: 'team' },
            { num: 3, desc: 'Gwardzista', __category: 'rest-noncombat' },
            { num: 4, __category: 'rest', attack_num: 9 },
        ]);

        createAttackController(client).attackAllNonTeam();

        expect(attacked(sendCommand)).toEqual(['zabij ob_3', 'zabij ob_4']);
    });

    it('still skips allies', () => {
        const { client, sendCommand } = makeClient([
            { num: 1, __category: 'player' },
            { num: 2, __category: 'rest-noncombat' },
            { num: 3, __category: 'rest-noncombat' },
        ]);

        createAttackController(client).attackAllNonTeam(id => id === 2);

        expect(attacked(sendCommand)).toEqual(['zabij ob_3']);
    });
});
