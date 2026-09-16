import { describe, expect, it } from 'vitest';
import { applySearch, clearSearch, foldText, matchesAllTerms, searchTerms } from '@web/settings/settingsSearch.ts';
import { SETTINGS_CATEGORIES, settingsCategoryByLabel } from '@web/settings/categories.ts';

describe('foldText', () => {
    it('drops Polish diacritics and case', () => {
        expect(foldText('Źródło ŁĄCZNOŚCI')).toBe('zrodlo lacznosci');
    });

    it('keeps the length, so match offsets map back onto the original text', () => {
        for (const text of ['Dźwięk i powiadomienia', 'Łódź', 'emoji 🎲 ok', 'İstanbul']) {
            expect(foldText(text)).toHaveLength(text.length);
        }
    });
});

describe('searchTerms / matchesAllTerms', () => {
    it('splits on whitespace and folds each term', () => {
        expect(searchTerms('  Kolor   TŁA ')).toEqual(['kolor', 'tla']);
        expect(searchTerms('   ')).toEqual([]);
    });

    it('requires every term, in any order', () => {
        const text = foldText('Kolor tła okna głównego');
        expect(matchesAllTerms(text, searchTerms('tla kolor'))).toBe(true);
        expect(matchesAllTerms(text, searchTerms('kolor mapy'))).toBe(false);
    });
});

function page(html: string): HTMLDivElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
}

describe('applySearch', () => {
    it('hides non-matching sections and reports pages with a hit', () => {
        const map = page('<section><h6>Mapa</h6><label>Powiększenie</label></section><section><h6>Marker gracza</h6></section>');
        const footer = page('<section><h6>Stan postaci</h6><select><option>Pasek graficzny</option></select></section>');
        const pages = [
            { element: map, pageText: 'Interfejs Mapa' },
            { element: footer, pageText: 'Interfejs Stopka' },
        ];

        const hits = applySearch(pages, searchTerms('powiekszenie'));

        expect([...hits]).toEqual([0]);
        const [zoom, marker] = map.querySelectorAll('section');
        expect(zoom.hasAttribute('data-settings-search-miss')).toBe(false);
        expect(marker.hasAttribute('data-settings-search-miss')).toBe(true);
        expect(footer.querySelector('section')!.hasAttribute('data-settings-search-miss')).toBe(true);
    });

    it('matches option text inside a select', () => {
        const footer = page('<section><h6>Stan postaci</h6><select><option>Pasek graficzny</option></select></section>');
        expect([...applySearch([{ element: footer, pageText: '' }], searchTerms('graficzny'))]).toEqual([0]);
    });

    it('lets the page label satisfy a term, so "mapa kolor" finds colours on the map page', () => {
        const map = page('<section><h6>Pomieszczenia</h6><label>Kolor linii</label></section>');
        const footer = page('<section><label>Kolor paska</label></section>');
        const hits = applySearch([
            { element: map, pageText: 'Interfejs Mapa' },
            { element: footer, pageText: 'Interfejs Stopka' },
        ], searchTerms('mapa kolor'));
        expect([...hits]).toEqual([0]);
    });

    it('does not match across two neighbouring labels', () => {
        // "Kolor" + "ZT" + "Ładowanie" used to read as "...ztladowanie", so
        // "tla" hit the guild list.
        const guilds = page('<section><span>Kolor</span><b>ZT</b><label>Ładowanie triggerów</label></section>');
        expect([...applySearch([{ element: guilds, pageText: '' }], searchTerms('kolor tla'))]).toEqual([]);
    });

    it('judges only top-level sections', () => {
        const el = page('<section><h6>Magiki</h6><section><h6>Kolory</h6></section></section>');
        applySearch([{ element: el, pageText: '' }], searchTerms('kolory'));
        expect(el.querySelectorAll('[data-settings-search-miss]')).toHaveLength(0);
    });

    it('clearSearch restores every section', () => {
        const el = page('<section>a</section><section>b</section>');
        const pages = [{ element: el, pageText: '' }];
        applySearch(pages, ['zzz']);
        expect(el.querySelectorAll('[data-settings-search-miss]')).toHaveLength(2);
        clearSearch(pages);
        expect(el.querySelectorAll('[data-settings-search-miss]')).toHaveLength(0);
    });
});

describe('settings categories', () => {
    it('has unique labels, so a label identifies one page', () => {
        const labels = SETTINGS_CATEGORIES.map(c => c.label);
        expect(new Set(labels).size).toBe(labels.length);
        expect(settingsCategoryByLabel('Stopka')?.key).toBe('ui-footer');
        expect(settingsCategoryByLabel('Nie ma')).toBeUndefined();
    });

    it('prefixes every key with its group', () => {
        for (const c of SETTINGS_CATEGORIES) {
            expect(c.key.startsWith(`${c.group}-`), c.key).toBe(true);
        }
    });
});
