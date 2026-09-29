import { getStrategy } from '@web/objectList/strategies';
import { buildRenderContext } from '@web/objectList/context';
import { setRenderSettings } from '@modules/core/settings';

// coveredId -> attacker ids it is covered against
let covers: Record<number, number[]> = {};

vi.mock('@client/scripts/coverTracker.ts', () => ({
    getCoverTracker: () => ({
        isCoveredFor: (coveredId: number, attackerId: number) => (covers[coveredId] ?? []).includes(attackerId),
    }),
}));

const client = {
    TeamManager: {
        playerNum: 1,
        isInTeam: (desc: string) => desc === 'Aragorn' || desc === 'Legolas',
        getEnemyQueue: () => [],
        isLeader: () => false,
    },
} as any;

const objects = [
    { num: 1, shortcut: '@', desc: 'Gandalf', hp: 6, attack_num: false },
    { num: 2, shortcut: '2', desc: 'Aragorn', hp: 5, attack_num: 4 },
    { num: 3, shortcut: '3', desc: 'Legolas', hp: 5, attack_num: 5 },
    { num: 4, shortcut: '4', desc: 'Duzy ork', hp: 3, attack_num: 2 },
    { num: 5, shortcut: '5', desc: 'Goblin', hp: 5, attack_num: 3 },
    { num: 6, shortcut: '6', desc: 'Troll', hp: 5, attack_num: false },
];

const ctx = () => buildRenderContext(client, objects, 'zabij');

beforeEach(() => {
    covers = { 4: [1, 2], 5: [3] };
    setRenderSettings({ objectListCoverMarkers: true });
});

afterEach(() => {
    setRenderSettings({ objectListCoverMarkers: false });
});

describe('cover marks', () => {
    test('covered against us wins; covered against a teammate only is the outline kind', () => {
        const marks = ctx().coverMarks;
        expect(marks.get(4)).toEqual({ kind: 'us', blocked: ['ty', 'Aragorn'] });
        expect(marks.get(5)).toEqual({ kind: 'team', blocked: ['Legolas'] });
        expect(marks.has(6)).toBe(false);
    });

    test('a covered teammate is not marked', () => {
        covers = { 2: [4] };
        expect(ctx().coverMarks.size).toBe(0);
    });

    test('nothing is marked and nothing is padded with the setting off', () => {
        setRenderSettings({ objectListCoverMarkers: false });
        const c = ctx();
        expect(c.coverMarks.size).toBe(0);
        expect(getStrategy('list').render(c)).not.toContain('cover-mark');
    });

    test('every flavor puts the shield after the name', () => {
        for (const mode of ['list', 'card', 'compact', 'compact-dots', 'raid', 'nearby'] as const) {
            const doc = document.createElement('div');
            doc.innerHTML = getStrategy(mode).render(ctx());
            const us = doc.querySelector('.is-covered-us[data-object-id="4"]');
            const team = doc.querySelector('.is-covered-team[data-object-id="5"]');
            expect(us?.lastElementChild?.classList.contains('cover-mark--us'), mode).toBe(true);
            expect(team?.lastElementChild?.classList.contains('cover-mark--team'), mode).toBe(true);
            expect(team?.querySelector('title')?.textContent, mode).toBe('Zasłonięty przed: Legolas');
        }
    });

    test('the list reserves two columns after every name, so the arrows line up', () => {
        const lines = getStrategy('list').render(ctx()).split('<br>');
        // Drop the shield (it floats, takes no column) and the tags around the text.
        const plain = (html: string) => html.replace(/<svg.*?<\/svg>/g, '').replace(/<[^>]+>/g, '');
        const aragorn = plain(lines[1]); // longest-but-one name, attacked by 4
        const ork = plain(lines[3]); // the longest name, covered and attacked by 2
        expect(ork).toContain('Duzy ork   <- 2');
        expect(ork.indexOf('<-')).toBe(aragorn.indexOf('<-'));
    });
});
