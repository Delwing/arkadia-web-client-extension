import { afterEach, describe, expect, test } from 'vitest';
import {
    highlightRuns,
    indexPage,
    matchSettings,
    pageMatches,
    pageSections,
    settingPreview,
    settingsCountText,
    unsavedChangesText,
} from '@web/settings/settingsIndex.ts';
import { searchTerms } from '@web/settings/settingsSearch.ts';

/**
 * The phone's search works per setting: a checkbox row, or a labelled field,
 * found in the rendered page the same way the wide layout finds sections.
 */

function page(html: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
});

const ITEMS = `
<section class="character-settings-section">
  <h5 class="character-settings-section-title">Zbieranie przedmiotów</h5>
  <div class="popup-field">
    <label class="popup-field__label" for="mode">Tryb zbierania</label>
    <select id="mode"><option value="all">wszystko</option><option value="coins" selected>tylko monety</option></select>
  </div>
  <div class="popup-field">
    <label class="popup-field__label">Co zbierać</label>
    <label class="popup-check"><input type="checkbox" checked><span>Miedziane monety</span></label>
    <label class="popup-check"><input type="checkbox"><span>Złote monety</span></label>
  </div>
  <div data-settings-ignore>
    <label class="popup-check"><input type="checkbox"><span>Pomocnik, nie ustawienie</span></label>
  </div>
</section>
<section class="ui-settings-section">
  <div class="ui-settings-section-header"><h6 class="ui-settings-section-title">Pojemniki</h6><button>x</button></div>
  <div class="popup-field">
    <label class="popup-field__label" for="cols">Kolumny</label>
    <input id="cols" type="number" value="3">
  </div>
  <div class="popup-field">
    <label class="popup-field__label">Przedrostek</label>
    <label class="popup-check"><input type="radio" name="p"><span>Kompaktowy</span></label>
    <label class="popup-check"><input type="radio" name="p" checked><span>Strzałka</span></label>
  </div>
</section>`;

describe('indexPage', () => {
    test('one entry per setting, card by card, leaving out what is not a setting', () => {
        const entries = indexPage(page(ITEMS));
        expect(entries.map((e) => [e.section, e.label, e.kind])).toEqual([
            ['Zbieranie przedmiotów', 'Tryb zbierania', 'value'],
            ['Zbieranie przedmiotów', 'Miedziane monety', 'toggle'],
            ['Zbieranie przedmiotów', 'Złote monety', 'toggle'],
            ['Pojemniki', 'Kolumny', 'value'],
            ['Pojemniki', 'Przedrostek', 'value'],
        ]);
    });

    test('a page without cards is one untitled card', () => {
        const entries = indexPage(page('<label class="popup-check"><input type="checkbox"><span>Sam</span></label>'));
        expect(entries).toHaveLength(1);
        expect(entries[0].section).toBe('');
    });

    test('previews show what a value setting is set to', () => {
        const [mode, , , cols, prefix] = indexPage(page(ITEMS));
        expect(settingPreview(mode)).toBe('tylko monety');
        expect(settingPreview(cols)).toBe('3');
        expect(settingPreview(prefix)).toBe('Strzałka');
    });
});

describe('matchSettings', () => {
    test('matches labels regardless of case and Polish letters', () => {
        const matches = matchSettings(indexPage(page(ITEMS)), searchTerms('ZLOTE'));
        expect(matches.map((m) => m.entry.label)).toEqual(['Złote monety']);
    });

    test('a select also matches through its options, and says which one', () => {
        const matches = matchSettings(indexPage(page(ITEMS)), searchTerms('monet'));
        expect(matches.map((m) => [m.entry.label, m.viaOption])).toEqual([
            ['Tryb zbierania', 'tylko monety'],
            ['Miedziane monety', undefined],
            ['Złote monety', undefined],
        ]);
    });

    test('card and page names do not count', () => {
        expect(matchSettings(indexPage(page(ITEMS)), searchTerms('pojemniki'))).toEqual([]);
    });
});

describe('pageMatches and pageSections', () => {
    test('a page matches by its own text or a card title, not by a setting on it', () => {
        const el = page(ITEMS);
        expect(pageMatches(el, 'Postać Przedmioty', searchTerms('przedmioty'))).toBe(true);
        expect(pageMatches(el, 'Postać Przedmioty', searchTerms('pojemniki'))).toBe(true);
        expect(pageMatches(el, 'Postać Przedmioty', searchTerms('kolumny'))).toBe(false);
    });

    test('sections come with their titles', () => {
        expect(pageSections(page(ITEMS)).map((s) => s.title)).toEqual(['Zbieranie przedmiotów', 'Pojemniki']);
    });
});

describe('text', () => {
    test('highlight runs mark every occurrence of every term', () => {
        expect(highlightRuns('Złote monety', searchTerms('zlo ety'))).toEqual([
            { text: 'Zło', hit: true },
            { text: 'te mon', hit: false },
            { text: 'ety', hit: true },
        ]);
    });

    test.each([
        [1, '1 niezapisana zmiana'],
        [2, '2 niezapisane zmiany'],
        [5, '5 niezapisanych zmian'],
        [12, '12 niezapisanych zmian'],
        [22, '22 niezapisane zmiany'],
    ])('%i changes read "%s"', (count, text) => {
        expect(unsavedChangesText(count)).toBe(text);
    });

    test('settings are counted the same way', () => {
        expect([1, 3, 11, 24].map(settingsCountText)).toEqual(['1 ustawienie', '3 ustawienia', '11 ustawień', '24 ustawienia']);
    });
});
