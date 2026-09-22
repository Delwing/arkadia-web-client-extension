import { describe, expect, it } from 'vitest';
import {
    buildDocPages,
    highlightHtml,
    pagesLabel,
    resultsLabel,
    searchDocs,
    type DocBlock,
} from '@web/documentation/docsModel.ts';
import { DOC_PAGES } from '@web/documentation/docPages.ts';

const COMBAT = `# Walka

Komendy do walki.

## Atakowanie

| Komenda | Opis |
|---------|------|
| \`/z id\` | Zabij obiekt o podanym id |
| \`/zz cel\` | Zaatakuj podany cel, np. \`/zz rusalke\` |
| \`/z_all\` | Atakuj wrogow druzyny |

> **Wskazowka:** Tryb ataku przelaczysz tez w stopce.

## Zaslanianie

| Komenda | Opis |
|---------|------|
| \`/zas id\` | Zaslon obiekt |

- pierwszy punkt o zaslonie
- drugi punkt

### Wiecej

Zwykly akapit.
`;

const BINDS = `# Bindowanie

Bindy.

## Domyslne bindy

| Klawisz | Nazwa | Akcja |
|---------|-------|-------|
| \`Ctrl+Q\` | Wesprzyj | Wysyla \`wesprzyj\` |
| \`\` \` \`\` | Tryb ruchu | Zmienia tryb ruchu |
| \`/depozytyw <filtr>\` | Otworz okno |
`;

const pages = buildDocPages([
    { key: 'combat', title: 'Walka', group: 'Gra', md: COMBAT },
    { key: 'binds', title: 'Bindowanie', group: 'Klient', md: BINDS },
    { key: 'custom', title: 'Własna', group: 'Gra', html: '<div><h1>X</h1><p>Wstep.</p><h2>Kolory</h2><p>Czerwony to wrog, zaslona.</p><ul><li>punkt</li></ul></div>' },
]);

const kinds = (blocks: DocBlock[]) => blocks.map((b) => b.kind);

describe('buildDocPages', () => {
    it('takes the title from the definition, the first paragraph as the lead and h2s as sections', () => {
        const [combat] = pages;
        expect(combat.title).toBe('Walka');
        expect(combat.lead).toBe('Komendy do walki.');
        expect(combat.sections.map((s) => s.title)).toEqual(['Atakowanie', 'Zaslanianie']);
        expect(combat.sections[0].id).toBe('doc-combat--atakowanie');
    });

    it('turns a Komenda table into commands: the first word, its arguments, what Wstaw types', () => {
        const [atak] = pages[0].sections;
        expect(kinds(atak.blocks)).toEqual(['commands', 'tip']);
        const commands = atak.blocks[0].kind === 'commands' ? atak.blocks[0].rows : [];
        expect(commands.map((c) => [c.head, c.args, c.insert])).toEqual([
            ['/z', 'id', '/z '],
            ['/zz', 'cel', '/zz '],
            ['/z_all', '', '/z_all'],
        ]);
        expect(commands[1].html).toContain('<code>/zz rusalke</code>');
    });

    it('splits lists into items and keeps h3s as subheadings', () => {
        expect(kinds(pages[0].sections[1].blocks)).toEqual(['commands', 'text', 'text', 'subheading', 'text']);
    });

    it('a key table has no Wstaw, and its name goes in bold before the action', () => {
        const block = pages[1].sections[0].blocks[0];
        const row = block.kind === 'commands' ? block.rows[0] : null;
        expect(row?.head).toBe('Ctrl+Q');
        expect(row?.insert).toBeNull();
        expect(row?.html).toBe('<strong>Wesprzyj</strong>: Wysyla <code>wesprzyj</code>');
    });

    it('takes a code span as written: the backtick bind, and <placeholders>', () => {
        const block = pages[1].sections[0].blocks[0];
        const rows = block.kind === 'commands' ? block.rows : [];
        expect(rows[1].head).toBe('`');
        expect([rows[2].head, rows[2].args]).toEqual(['/depozytyw', '<filtr>']);
    });

    it('indexes an HTML page by its h2s', () => {
        const custom = pages[2];
        expect(custom.custom).toBeDefined();
        expect(custom.lead).toBe('Wstep.');
        expect(custom.sections.map((s) => s.title)).toEqual(['Kolory']);
        expect(custom.sections[0].blocks).toHaveLength(2);
    });

    it('parses every real page into titled sections', () => {
        const real = buildDocPages(DOC_PAGES);
        for (const page of real) {
            expect(page.sections.some((s) => s.title), page.key).toBe(true);
        }
        const combat = real.find((p) => p.key === 'combat')!;
        const commands = combat.sections.flatMap((s) => s.blocks).flatMap((b) => (b.kind === 'commands' ? b.rows : []));
        expect(commands.length).toBeGreaterThan(20);
        expect(commands.every((c) => !c.head.includes('`'))).toBe(true);
    });
});

describe('searchDocs', () => {
    it('finds commands, tips and text on every page, ignoring case and Polish letters', () => {
        const result = searchDocs(pages, 'ZASŁON');
        expect(result.perPage.map((p) => [p.page.key, p.count])).toEqual([
            ['combat', 2],
            ['custom', 1],
        ]);
        expect(result.total).toBe(3);
        const hits = result.groups[0].hits;
        expect(hits[0]).toMatchObject({ kind: 'command', row: { head: '/zas' } });
    });

    it('needs every word', () => {
        expect(searchDocs(pages, 'zabij obiekt').total).toBe(1);
        expect(searchDocs(pages, 'zabij smoka').total).toBe(0);
    });
});

describe('highlightHtml', () => {
    it('marks text, never tags or entities', () => {
        expect(highlightHtml('Zaslon <code>zaslon</code> &amp; code', ['zaslon', 'code'])).toBe(
            '<mark>Zaslon</mark> <code><mark>zaslon</mark></code> &amp; <mark>code</mark>',
        );
    });

    it('keeps the original letters', () => {
        expect(highlightHtml('Zasłoń go', ['zaslon'])).toBe('<mark>Zasłoń</mark> go');
    });
});

describe('labels', () => {
    it('declines', () => {
        expect([1, 2, 5, 12, 22, 25].map(resultsLabel)).toEqual(['1 wynik', '2 wyniki', '5 wyników', '12 wyników', '22 wyniki', '25 wyników']);
        expect(pagesLabel(1)).toBe('na 1 stronie');
        expect(pagesLabel(4)).toBe('na 4 stronach');
    });
});
