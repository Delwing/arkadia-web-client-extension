import { buildHerbTextBuffer, buildHerbTextSummary } from '@client/scripts/herbTextBuilder';
import type { HerbsData } from '@client/scripts/herbsLoader';
import type { HerbBagsState } from '@client/types/herbs';

const GLYPH_SELECTOR = '.herb-smoke-glyph';

const herbsData: HerbsData = {
    herb_id_to_odmiana: {},
    version: 1,
    herb_id_to_use: {
        // Both edible and smokable.
        liscie: [
            { action: 'zjedz', effect: '+hp' },
            { action: 'zapal', effect: '', smokable: true },
        ],
        // Smokable only.
        tytun: [{ action: 'zapal', effect: '', smokable: true }],
        // Not smokable.
        babka: [{ action: 'przyloz', effect: '+kon' }],
    },
};

const bags: HerbBagsState = {
    1: { herbs: { liscie: 3, tytun: 2, babka: 1 } },
};

function render(state: HerbBagsState): HTMLDivElement {
    const container = document.createElement('div');
    container.appendChild(buildHerbTextBuffer(state, herbsData).toDom());
    return container;
}

describe('herb text builder smokable section', () => {
    test('flags smokable herbs in the summary', () => {
        const summary = buildHerbTextSummary(bags, herbsData);
        const byId = Object.fromEntries(summary.rows.map(r => [r.herbId, r.smokable]));
        expect(byId.liscie).toBe(true);
        expect(byId.tytun).toBe(true);
        expect(byId.babka).toBe(false);
    });

    test('shows smokable herbs only in the smokable section, one per line', () => {
        const text = buildHerbTextBuffer(bags, herbsData).text;
        const [table, section] = text.split('Do palenia:');

        expect(section).toBeDefined();
        // Smokable herbs appear only in the bottom section, never the main table
        // (even when they also have an edible use, like liscie).
        expect(section).toContain('liscie');
        expect(section).toContain('tytun');
        expect(table).not.toContain('liscie');
        expect(table).not.toContain('tytun');

        // Smokable markers never render as actions anywhere.
        expect(text).not.toContain('zapal');

        // Non-smokable herbs stay in the main table only.
        expect(table).toContain('babka');
        expect(table).toContain('przyloz:');
        expect(section).not.toContain('babka');

        // One glyph marker per smokable herb, each on its own line.
        const sectionLines = section.split('\n').filter(l => l.trim().length > 0);
        expect(sectionLines).toHaveLength(2);
        expect(render(bags).querySelectorAll(GLYPH_SELECTOR)).toHaveLength(2);
    });

    test('omits the smokable section when nothing is smokable', () => {
        const onlyBabka: HerbBagsState = { 1: { herbs: { babka: 1 } } };
        const buffer = buildHerbTextBuffer(onlyBabka, herbsData);
        expect(buffer.text).not.toContain('Do palenia:');
        expect(buffer.text).toContain('babka');
        expect(render(onlyBabka).querySelectorAll(GLYPH_SELECTOR)).toHaveLength(0);
    });
});
