import { EventEmitter } from 'events';
import initTeamPanel, { computeMissingMembers } from '@client/scripts/teamPanel';

interface LocObject {
    num: number;
    desc?: string;
    __category?: 'player' | 'team' | 'rest' | 'rest-noncombat';
}

class FakeClient {
    private emitter = new EventEmitter();
    teamMembers: string[] = [];
    locationObjects: LocObject[] = [];
    sendEvent = vi.fn();

    TeamManager = {
        getTeamMembers: () => this.teamMembers,
    };
    ObjectManager = {
        getObjectsOnLocation: () => this.locationObjects,
    };

    on(event: string, cb: any) {
        this.emitter.on(event, cb);
    }
    emit(event: string, payload?: any) {
        this.emitter.emit(event, payload);
    }
}

function lastStatus(client: FakeClient): any {
    const calls = client.sendEvent.mock.calls.filter(c => c[0] === 'teamPanelStatus');
    return calls.length ? calls[calls.length - 1][1] : undefined;
}

describe('computeMissingMembers', () => {
    test('reports nobody missing when all team objects present', () => {
        expect(
            computeMissingMembers(['Alvin', 'Borys'], [
                { __category: 'team', desc: 'Alvin' },
                { __category: 'team', desc: 'Borys' },
            ] as any),
        ).toEqual([]);
    });

    test('counts self via the player category', () => {
        expect(
            computeMissingMembers(['Alvin', 'Borys'], [
                { __category: 'player', desc: 'Alvin' },
                { __category: 'team', desc: 'Borys' },
            ] as any),
        ).toEqual([]);
    });

    test('lists members that are not on the location', () => {
        expect(
            computeMissingMembers(['Alvin', 'Borys', 'Cyryl'], [
                { __category: 'team', desc: 'Alvin' },
            ] as any),
        ).toEqual(['Borys', 'Cyryl']);
    });
});

describe('team panel status emission', () => {
    let client: FakeClient;

    beforeEach(() => {
        client = new FakeClient();
    });

    test('emits an empty status at init when not in a team', () => {
        initTeamPanel(client as unknown as any);
        expect(lastStatus(client)).toEqual({ teamSize: 0, missing: [] });
    });

    test('emits computed size and missing members', () => {
        client.teamMembers = ['Alvin', 'Borys', 'Cyryl'];
        client.locationObjects = [{ num: 1, desc: 'Alvin', __category: 'team' }];
        initTeamPanel(client as unknown as any);

        expect(lastStatus(client)).toEqual({ teamSize: 3, missing: ['Borys', 'Cyryl'] });
    });

    test('recomputes on teamChange', () => {
        initTeamPanel(client as unknown as any);

        client.teamMembers = ['Alvin'];
        client.locationObjects = [{ num: 1, desc: 'Alvin', __category: 'team' }];
        client.emit('teamChange');

        expect(lastStatus(client)).toEqual({ teamSize: 1, missing: [] });
    });

    test('does not re-emit when the status is unchanged', () => {
        client.teamMembers = ['Alvin'];
        client.locationObjects = [{ num: 1, desc: 'Alvin', __category: 'team' }];
        initTeamPanel(client as unknown as any);

        const before = client.sendEvent.mock.calls.length;
        client.emit('gmcp.objects.data');
        expect(client.sendEvent.mock.calls.length).toBe(before);
    });

    test('clears the status on disconnect', () => {
        client.teamMembers = ['Alvin'];
        client.locationObjects = [{ num: 1, desc: 'Alvin', __category: 'team' }];
        initTeamPanel(client as unknown as any);

        client.emit('client.disconnect');
        expect(lastStatus(client)).toEqual({ teamSize: 0, missing: [] });
    });
});
