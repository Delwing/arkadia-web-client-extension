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
    const client: any = {
        Map: { stepShadow: shadow, createHighlighter, getRoomById: (id: number) => rooms[id], currentRoom: rooms[1] },
        Triggers: { registerTrigger: vi.fn() },
        aliases: [],
        println: vi.fn(),
    };
    initStepShadowReport(client);
    return {
        shadow,
        createHighlighter,
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
