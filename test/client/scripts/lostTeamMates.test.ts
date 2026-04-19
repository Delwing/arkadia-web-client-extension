import initLostTeamMates from '@client/scripts/lostTeamMates';
import { EventEmitter } from 'events';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeMap {
    currentRoom: { id: number } | null = null;
}

class FakeClient {
    private emitter = new EventEmitter();
    Map = new FakeMap();
    TeamManager = {
        isInTeam: jest.fn((_name: string) => false),
        getTeamMemberObjectId: jest.fn((_name: string) => undefined as number | undefined),
        getAccumulatedObjectsData: jest.fn(() => new Map<number, any>()),
    } as any;
    Triggers = {
        triggers: [] as Array<{ pattern: RegExp; callback: Function; tag?: string }>,
        registerTrigger: jest.fn((pattern: RegExp, callback: Function, tag?: string) => {
            (this.Triggers.triggers as any[]).push({ pattern, callback, tag });
        }),
    } as any;
    sentEvents: Array<{ type: string; detail: any }> = [];
    on(event: string, cb: any) {
        this.emitter.on(event, cb);
        return () => this.emitter.off(event, cb);
    }
    sendEvent(type: string, detail?: any) {
        this.sentEvents.push({ type, detail });
        this.emitter.emit(type, detail);
    }
    lastLostRooms(): number[] | null {
        for (let i = this.sentEvents.length - 1; i >= 0; i--) {
            if (this.sentEvents[i].type === 'mapLostRooms') return this.sentEvents[i].detail;
        }
        return null;
    }
}

function fireTrigger(client: FakeClient, input: string): AnsiAwareBuffer | null {
    for (const entry of client.Triggers.triggers as any[]) {
        const match = input.match(entry.pattern);
        if (match) {
            const line = new AnsiAwareBuffer(input);
            const result = entry.callback(line, match, '');
            return result ?? line;
        }
    }
    return null;
}

describe('lostTeamMates', () => {
    let client: FakeClient;

    beforeEach(() => {
        client = new FakeClient();
        jest.useFakeTimers();
        initLostTeamMates(client as unknown as any);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Gubisz', () => {
        beforeEach(() => {
            client.TeamManager.getAccumulatedObjectsData.mockReturnValue(new Map([
                [1, { team: true, desc: 'You' }],
                [2, { team: true, desc: 'Pabel' }],
            ]));
        });

        test('marks previous room when a team member disappears after Gubisz', () => {
            client.sendEvent('enterLocation', { id: 100 });
            client.sendEvent('enterLocation', { id: 200 });
            client.sendEvent('gmcp.objects.nums', [1, 2]);

            fireTrigger(client, 'Gubisz gdzies za soba Pabla.');
            client.sendEvent('gmcp.objects.nums', [1]);

            expect(client.lastLostRooms()).toEqual([100]);
        });

        test('clears mark when disappeared member reappears', () => {
            client.sendEvent('enterLocation', { id: 100 });
            client.sendEvent('enterLocation', { id: 200 });
            client.sendEvent('gmcp.objects.nums', [1, 2]);
            fireTrigger(client, 'Gubisz gdzies za soba Pabla.');
            client.sendEvent('gmcp.objects.nums', [1]);
            expect(client.lastLostRooms()).toEqual([100]);

            client.sendEvent('gmcp.objects.nums', [1, 2]);
            expect(client.lastLostRooms()).toEqual([]);
        });

        test('disappearance without preceding Gubisz does not mark', () => {
            client.sendEvent('enterLocation', { id: 100 });
            client.sendEvent('enterLocation', { id: 200 });
            client.sendEvent('gmcp.objects.nums', [1, 2]);

            client.sendEvent('gmcp.objects.nums', [1]);

            expect(client.lastLostRooms()).toBeNull();
        });

        test('Gubisz with no subsequent disappearance marks nothing', () => {
            client.sendEvent('enterLocation', { id: 100 });
            client.sendEvent('enterLocation', { id: 200 });
            client.sendEvent('gmcp.objects.nums', [1, 2]);

            fireTrigger(client, 'Gubisz gdzies za soba Pabla.');
            client.sendEvent('gmcp.objects.nums', [1, 2]);

            expect(client.lastLostRooms()).toBeNull();
        });

        test('tracks multiple disappeared team members and clears each independently', () => {
            client.TeamManager.getAccumulatedObjectsData.mockReturnValue(new Map([
                [1, { team: true }],
                [2, { team: true }],
                [3, { team: true }],
            ]));
            client.sendEvent('enterLocation', { id: 100 });
            client.sendEvent('enterLocation', { id: 200 });
            client.sendEvent('gmcp.objects.nums', [1, 2, 3]);

            fireTrigger(client, 'Gubisz gdzies za soba Pabla i Vesper.');
            client.sendEvent('gmcp.objects.nums', [1]);
            expect(client.lastLostRooms()).toEqual([100]);

            client.sendEvent('gmcp.objects.nums', [1, 2]);
            expect(client.lastLostRooms()).toEqual([100]);

            client.sendEvent('gmcp.objects.nums', [1, 2, 3]);
            expect(client.lastLostRooms()).toEqual([]);
        });

        test('clears mark after 120s timeout', () => {
            client.sendEvent('enterLocation', { id: 100 });
            client.sendEvent('enterLocation', { id: 200 });
            client.sendEvent('gmcp.objects.nums', [1, 2]);
            fireTrigger(client, 'Gubisz gdzies za soba Pabla.');
            client.sendEvent('gmcp.objects.nums', [1]);
            expect(client.lastLostRooms()).toEqual([100]);

            jest.advanceTimersByTime(120_000);
            expect(client.lastLostRooms()).toEqual([]);
        });

        test('re-entering the marked room does not clear on its own', () => {
            client.sendEvent('enterLocation', { id: 100 });
            client.sendEvent('enterLocation', { id: 200 });
            client.sendEvent('gmcp.objects.nums', [1, 2]);
            fireTrigger(client, 'Gubisz gdzies za soba Pabla.');
            client.sendEvent('gmcp.objects.nums', [1]);
            expect(client.lastLostRooms()).toEqual([100]);

            client.sendEvent('enterLocation', { id: 100 });
            expect(client.lastLostRooms()).toEqual([100]);
        });
    });

    describe('traci kontakt', () => {
        test('marks current room when name is team member', () => {
            client.TeamManager.isInTeam.mockImplementation((name: string) => name === 'Dur');
            client.TeamManager.getTeamMemberObjectId.mockImplementation((name: string) =>
                name === 'Dur' ? 77 : undefined,
            );
            client.sendEvent('enterLocation', { id: 500 });

            fireTrigger(client, 'Dur traci kontakt z rzeczywistoscia.');

            expect(client.lastLostRooms()).toEqual([500]);
        });

        test('does not mark when name is not a team member', () => {
            client.TeamManager.isInTeam.mockReturnValue(false);
            client.sendEvent('enterLocation', { id: 500 });

            fireTrigger(client, 'Obcy traci kontakt z rzeczywistoscia.');

            expect(client.lastLostRooms()).toBeNull();
        });

        test('"Mimo to" variant never marks but still colors', () => {
            client.TeamManager.isInTeam.mockReturnValue(true);
            client.sendEvent('enterLocation', { id: 500 });

            const result = fireTrigger(
                client,
                'Dur traci kontakt z rzeczywistoscia. Mimo to, nie opuszcza swiata Arkadii.',
            );

            expect(result).not.toBeNull();
            expect(client.lastLostRooms()).toBeNull();
        });

        test('"odzyskuje kontakt" clears the matching lost entry', () => {
            client.TeamManager.isInTeam.mockReturnValue(true);
            client.TeamManager.getTeamMemberObjectId.mockReturnValue(77);
            client.sendEvent('enterLocation', { id: 42 });
            fireTrigger(client, 'Dur traci kontakt z rzeczywistoscia.');
            expect(client.lastLostRooms()).toEqual([42]);

            fireTrigger(client, 'Dur odzyskuje kontakt z rzeczywistoscia.');
            expect(client.lastLostRooms()).toEqual([]);
        });

        test('reappearance of object id in objects.nums clears traci-kontakt mark', () => {
            client.TeamManager.isInTeam.mockReturnValue(true);
            client.TeamManager.getTeamMemberObjectId.mockReturnValue(77);
            client.sendEvent('enterLocation', { id: 42 });
            fireTrigger(client, 'Dur traci kontakt z rzeczywistoscia.');
            expect(client.lastLostRooms()).toEqual([42]);

            client.sendEvent('gmcp.objects.nums', [77, 99]);
            expect(client.lastLostRooms()).toEqual([]);
        });
    });

    test('responds to requestMapLostRooms by re-emitting current state', () => {
        client.TeamManager.getAccumulatedObjectsData.mockReturnValue(new Map([
            [1, { team: true }],
            [2, { team: true }],
        ]));
        client.sendEvent('enterLocation', { id: 1 });
        client.sendEvent('enterLocation', { id: 2 });
        client.sendEvent('gmcp.objects.nums', [1, 2]);
        fireTrigger(client, 'Gubisz gdzies za soba Pabla.');
        client.sendEvent('gmcp.objects.nums', [1]);
        expect(client.lastLostRooms()).toEqual([1]);

        const before = client.sentEvents.filter(e => e.type === 'mapLostRooms').length;
        client.sendEvent('requestMapLostRooms');
        const after = client.sentEvents.filter(e => e.type === 'mapLostRooms').length;
        expect(after).toBeGreaterThan(before);
        expect(client.lastLostRooms()).toEqual([1]);
    });
});
