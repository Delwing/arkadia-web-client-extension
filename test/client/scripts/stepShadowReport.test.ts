import initStepShadowReport, {SHADOW_MARKER_COLOR} from '@client/scripts/stepShadowReport.ts';
import {StepShadow} from '@client/map/StepShadow.ts';
import {setMapSettings} from '@modules/core/settings';

/** A corridor 1 - 2 - 3 running north. */
const rooms: Record<number, any> = {
    1: { id: 1, exits: { north: 2 } },
    2: { id: 2, exits: { north: 3, south: 1 } },
    3: { id: 3, exits: { south: 2 } },
};

function setup() {
    let mapRoom: number | undefined = 1;
    const shadow = new StepShadow({
        getRoom: id => rooms[id],
        resolve: direction => direction,
        mapRoomId: () => mapRoom,
    });
    const marked = new Set<number>();
    let enabled = false;
    const highlighter = {
        add: (id: number) => marked.add(id),
        remove: (id: number) => marked.delete(id),
        enable: () => { enabled = true; },
        disable: () => { enabled = false; },
        isEnabled: () => enabled,
    };
    const createHighlighter = vi.fn(() => highlighter);
    // Placing the map tells the shadow, as PositionTracker.renderRoomById does.
    const setMapRoomById = vi.fn((id: number) => {
        if (id === mapRoom) return;
        mapRoom = id;
        shadow.placed(id);
    });
    const client: any = {
        Map: { stepShadow: shadow, createHighlighter, setMapRoomById, getRoomById: (id: number) => rooms[id], currentRoom: rooms[1] },
        Triggers: { registerTrigger: vi.fn() },
        aliases: [],
        println: vi.fn(),
    };
    initStepShadowReport(client);
    return {
        shadow,
        createHighlighter,
        setMapRoomById,
        mapRoom: () => mapRoom,
        shown: () => (enabled ? [...marked] : []),
        setMap: (id: number) => { mapRoom = id; },
    };
}

describe('step shadow marker', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('is off by default and marks nothing', () => {
        const t = setup();
        expect(t.createHighlighter).toHaveBeenCalledWith({color: SHADOW_MARKER_COLOR, enabled: false});
        t.setMap(2);
        t.shadow.step('n', 1);
        expect(t.shown()).toEqual([]);
    });

    test('follows the room the queue believes we are in once the setting is on', () => {
        const t = setup();
        setMapSettings({mapShadowMarker: true});
        t.setMap(2);
        t.shadow.step('n', 1);
        t.setMap(3);
        t.shadow.step('n', 1);
        expect(t.shown()).toEqual([3]);
        // The second step is blocked: the queue falls back to 2 while the map stays on 3.
        t.shadow.roomInfo(2, () => {});
        t.shadow.reject('blokada');
        expect(t.shown()).toEqual([2]);
    });

    test('turning the setting off clears the marker', () => {
        const t = setup();
        setMapSettings({mapShadowMarker: true});
        t.setMap(2);
        t.shadow.step('n', 1);
        expect(t.shown()).toEqual([2]);
        setMapSettings({mapShadowMarker: false});
        expect(t.shown()).toEqual([]);
        t.setMap(3);
        t.shadow.step('n', 1);
        expect(t.shown()).toEqual([]);
    });
});

describe('step queue correction', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('is off by default: the map stays where it walked', () => {
        const t = setup();
        t.setMap(2); t.shadow.step('n', 1);
        t.setMap(3); t.shadow.step('n', 1);
        t.shadow.roomInfo(2, () => {});
        t.shadow.reject('blokada');
        expect(t.setMapRoomById).not.toHaveBeenCalled();
        expect(t.mapRoom()).toBe(3);
    });

    test('moves the map to the queue\'s room after a refusal it disagrees with, keeping the queue', () => {
        const t = setup();
        setMapSettings({mapStepQueueCorrection: true});
        t.setMap(2); t.shadow.step('n', 1);
        t.setMap(3); t.shadow.step('n', 1);
        t.setMap(3); t.shadow.look();
        t.shadow.roomInfo(2, () => {});
        // The second n is blocked; the old flag missed it, so the map still stands on 3.
        t.shadow.reject('blokada');
        expect(t.setMapRoomById).toHaveBeenCalledWith(2);
        expect(t.mapRoom()).toBe(2);
        // The correction is not a placement: the look still waits for its room.info.
        expect(t.shadow.pending.map(e => e.kind)).toEqual(['look']);
        expect(t.shadow.confirmedRoom).toBe(2);
    });

    test('leaves a room.info nothing waited for to the map, as a team follow moves it next', () => {
        const t = setup();
        setMapSettings({mapStepQueueCorrection: true});
        t.shadow.roomInfo(3, () => {});
        expect(t.setMapRoomById).not.toHaveBeenCalled();
    });

    test('does nothing while the queue and the map agree', () => {
        const t = setup();
        setMapSettings({mapStepQueueCorrection: true});
        t.setMap(2); t.shadow.step('n', 1);
        t.shadow.roomInfo(2, () => {});
        expect(t.setMapRoomById).not.toHaveBeenCalled();
    });
});
