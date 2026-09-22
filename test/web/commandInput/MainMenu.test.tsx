import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { characterStorage } from '@modules/core/storage';
import { registerMainMenuItem, unregisterMainMenuItem, updateMainMenuItem, type MainMenuItem } from '@modules/core/mainMenuRegistry';
import { setConnectionStatus } from '@web/commandInput/connectionView.ts';
import MainMenu from '@web/commandInput/MainMenu.tsx';

/**
 * The ⋯ menu: entries in sections, a filter whose Enter runs the first match,
 * arrow keys through the entries, the connection line, and the phone sheet.
 */

const selected: string[] = [];
const registered: string[] = [];

function add(item: Partial<MainMenuItem> & { id: string; label: string }): void {
    registered.push(item.id);
    registerMainMenuItem({ order: 10, source: 'builtin', onSelect: () => selected.push(item.id), ...item });
}

let container: HTMLElement;
let root: Root;

function mount(): void {
    act(() => root.render(<MainMenu />));
}

const panel = () => container.querySelector<HTMLElement>('.command-menu__panel');
const filter = () => container.querySelector<HTMLInputElement>('#command-menu-filter');
const captions = () => Array.from(container.querySelectorAll('.command-menu__caption')).map((el) => el.textContent);
const sectionIds = (group: string) =>
    Array.from(container.querySelectorAll(`[data-group="${group}"] .command-menu__item`)).map((el) => el.id);

function open(): void {
    act(() => container.querySelector<HTMLButtonElement>('#menu-button')!.click());
}

/** A React-controlled input only hears a value set through the native setter. */
function type(value: string): void {
    const input = filter()!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function key(target: Element, name: string): void {
    act(() => {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    });
}

function phone(matches: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
    }));
}

beforeEach(() => {
    selected.length = 0;
    add({ id: 'aliases-button', label: 'Aliasy', group: 'gra', icon: 'terminal', order: 10 });
    add({ id: 'share-location-button', label: 'Kod QR lokacji', shortLabel: 'Kod QR', group: 'gra', order: 20 });
    add({ id: 'options-button', label: 'Postać', group: 'ustawienia', order: 30 });
    add({ id: 'data-sources-button', label: 'Źródła danych', group: 'narzedzia', order: 40 });
    add({ id: 'helper-button', label: 'Helper', group: 'narzedzia', order: 50 });
    add({ id: 'fullscreen-button', label: 'Pełny ekran', group: 'sesja', order: 900 });
    add({ id: 'disconnect-button', label: 'Rozłącz', group: 'sesja', tone: 'danger', order: 910 });
    add({ id: 'plugin-1', label: 'Notatnik', source: 'plugin', order: 1000 });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    registered.splice(0).forEach((id) => unregisterMainMenuItem(id));
    setConnectionStatus('disconnected', 'direct');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('MainMenu', () => {
    test('closed until the button is pressed; the button shows it is open', () => {
        mount();
        expect(panel()).toBeNull();
        open();
        expect(panel()).not.toBeNull();
        expect(container.querySelector('#menu-button')!.classList.contains('is-active')).toBe(true);
    });

    test('entries sit in their sections; plugins go to Wtyczki; session actions to the bar', () => {
        mount();
        open();
        expect(captions()).toEqual(['Gra', 'Ustawienia', 'Narzędzia', 'Wtyczki']);
        expect(sectionIds('gra')).toEqual(['aliases-button', 'share-location-button']);
        expect(sectionIds('narzedzia')).toEqual(['data-sources-button', 'helper-button']);
        const plugin = container.querySelector('[data-group="wtyczki"] [data-plugin-menu-entry-id="plugin-1"]');
        expect(plugin?.textContent).toBe('Notatnik');
        expect(plugin?.id).toBe('');
        const bar = Array.from(container.querySelectorAll('.command-menu__bar .command-menu__item')).map((el) => el.id);
        expect(bar).toEqual(['fullscreen-button', 'disconnect-button']);
        expect(container.querySelector('#disconnect-button')!.classList.contains('command-menu__item--danger')).toBe(true);
    });

    test('a plugin entry that brings its own icon has it in the icon slot, not the puzzle', () => {
        const withSvg = document.createElement('span');
        withSvg.innerHTML = '<span style="margin-right: 6px"><svg></svg></span> Czat';
        add({ id: 'plugin-svg', label: withSvg, source: 'plugin' });
        add({ id: 'plugin-emoji', label: '⛭ Zegar', source: 'plugin' });
        const trailing = document.createElement('span');
        trailing.innerHTML = 'Mapa <svg></svg>';
        add({ id: 'plugin-trailing', label: trailing, source: 'plugin' });
        mount();
        open();
        const entry = (id: string) => container.querySelector(`[data-plugin-menu-entry-id="${id}"]`)!;
        const icons = (id: string) => entry(id).querySelectorAll('.command-menu__icon');
        const label = (id: string) => entry(id).querySelector('.command-menu__label')!;

        expect(icons('plugin-svg')).toHaveLength(1);
        expect(entry('plugin-svg').querySelector('.command-menu__icon--own svg')).not.toBeNull();
        expect(label('plugin-svg').querySelector('svg'), 'the icon left the label').toBeNull();
        expect(label('plugin-svg').innerHTML, 'with its spacing wrapper').not.toContain('margin');
        expect(label('plugin-svg').textContent).toBe('Czat');
        expect(withSvg.querySelector('svg'), 'the plugin keeps its own node').not.toBeNull();

        expect(entry('plugin-emoji').querySelector('.command-menu__icon--own')?.textContent).toBe('⛭');
        expect(label('plugin-emoji').textContent).toBe('Zegar');

        expect(entry('plugin-trailing').querySelector('.command-menu__icon--own'), 'an icon after the text stays').toBeNull();
        expect(label('plugin-trailing').querySelector('svg')).not.toBeNull();
        expect(icons('plugin-1'), 'a plain label keeps the puzzle').toHaveLength(1);
        expect(entry('plugin-1').querySelector('.command-menu__icon--own')).toBeNull();
    });

    test('a click runs the entry and closes the menu', () => {
        mount();
        open();
        act(() => container.querySelector<HTMLButtonElement>('#helper-button')!.click());
        expect(selected).toEqual(['helper-button']);
        expect(panel()).toBeNull();
    });

    test('a disabled entry cannot be run', () => {
        updateMainMenuItem('disconnect-button', { disabled: true });
        mount();
        open();
        expect(container.querySelector<HTMLButtonElement>('#disconnect-button')!.disabled).toBe(true);
    });

    test('the filter ignores case and Polish letters, and says when nothing matches', () => {
        mount();
        open();
        type('ZRODLA');
        expect(container.querySelectorAll('.command-menu__sections .command-menu__item')).toHaveLength(1);
        expect(captions()).toEqual(['Narzędzia']);
        expect(container.querySelector('#data-sources-button')!.classList.contains('is-first')).toBe(true);
        type('pelny');
        expect(container.querySelector('#fullscreen-button')!.classList.contains('is-first')).toBe(true);
        type('xyzzy');
        expect(container.querySelector('.command-menu__empty')?.textContent).toContain('xyzzy');
    });

    test('the filter finds an entry by its short label too', () => {
        mount();
        open();
        type('kod qr');
        expect(sectionIds('gra')).toEqual(['share-location-button']);
    });

    test('Enter runs the first match, skipping disabled ones', () => {
        updateMainMenuItem('aliases-button', { disabled: true });
        add({ id: 'aliases-2', label: 'Aliasy grupy', group: 'gra', order: 15 });
        mount();
        open();
        type('alia');
        key(filter()!, 'Enter');
        expect(selected).toEqual(['aliases-2']);
        expect(panel()).toBeNull();
    });

    test('Enter with an empty filter runs nothing', () => {
        mount();
        open();
        key(filter()!, 'Enter');
        expect(selected).toEqual([]);
        expect(panel()).not.toBeNull();
    });

    test('closing clears the filter', () => {
        mount();
        open();
        type('helper');
        act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
        expect(panel()).toBeNull();
        open();
        expect(filter()!.value).toBe('');
        expect(container.querySelectorAll('.command-menu__sections .command-menu__item')).toHaveLength(6);
    });

    test('arrow keys walk the entries and go back up into the filter', () => {
        mount();
        open();
        const items = () => Array.from(container.querySelectorAll<HTMLButtonElement>('.command-menu__item'));
        filter()!.focus();
        key(filter()!, 'ArrowDown');
        expect(document.activeElement).toBe(items()[0]);
        key(document.activeElement!, 'ArrowDown');
        expect(document.activeElement).toBe(items()[1]);
        key(document.activeElement!, 'ArrowUp');
        key(document.activeElement!, 'ArrowUp');
        expect(document.activeElement).toBe(filter());
    });

    test('ArrowDown stops at the last entry', () => {
        mount();
        open();
        const items = Array.from(container.querySelectorAll<HTMLButtonElement>('.command-menu__item'));
        items.at(-1)!.focus();
        key(items.at(-1)!, 'ArrowDown');
        expect(document.activeElement).toBe(items.at(-1));
    });

    describe('connection line', () => {
        const status = () => container.querySelector('.command-menu__status');
        const text = () => container.querySelector('.command-menu__status-text')?.textContent;

        test.each([
            ['connected', 'direct', 'połączony'],
            ['connected', 'proxy', 'połączony przez proxy'],
            ['connected', 'helper', 'połączony przez helpera'],
            ['connecting', 'proxy', 'łączenie…'],
            ['disconnected', 'proxy', 'rozłączony'],
        ] as const)('%s via %s reads "%s"', (state, route, expected) => {
            vi.spyOn(characterStorage, 'getCharacter').mockReturnValue(null);
            setConnectionStatus(state, route);
            mount();
            open();
            expect(status()?.getAttribute('data-status')).toBe(state);
            expect(text()).toBe(expected);
        });

        test('names the character, capitalised', () => {
            vi.spyOn(characterStorage, 'getCharacter').mockReturnValue('arel');
            setConnectionStatus('connected', 'proxy');
            mount();
            open();
            expect(container.querySelector('.command-menu__status-name')?.textContent).toBe('Arel');
            expect(text()).toBe('· połączony przez proxy');
        });

        test('follows the connection while open', () => {
            vi.spyOn(characterStorage, 'getCharacter').mockReturnValue(null);
            setConnectionStatus('connected', 'direct');
            mount();
            open();
            act(() => setConnectionStatus('connecting', 'direct'));
            expect(text()).toBe('łączenie…');
        });
    });

    describe('on a phone', () => {
        beforeEach(() => phone(true));

        test('a sheet without the filter or the connection line', () => {
            mount();
            open();
            expect(panel()!.classList.contains('command-menu__panel--sheet')).toBe(true);
            expect(panel()!.style.left, 'not placed by the desktop popover').toBe('');
            expect(filter()).toBeNull();
            expect(container.querySelector('.command-menu__status')).toBeNull();
            expect(container.querySelector('.command-menu__bar #disconnect-button')).not.toBeNull();
        });

        test('plugins join Narzędzia under one heading; tiles use the short labels', () => {
            mount();
            open();
            expect(captions()).toEqual(['Gra', 'Ustawienia', 'Narzędzia i wtyczki']);
            expect(sectionIds('narzedzia')).toEqual(['data-sources-button', 'helper-button', '']);
            expect(container.querySelector('#share-location-button')!.textContent).toBe('Kod QR');
        });

        test('a tap on the dimmed game closes it', () => {
            mount();
            open();
            act(() => container.querySelector<HTMLElement>('.command-menu__scrim')!.click());
            expect(panel()).toBeNull();
        });
    });

    test('tells the command line when it opens and closes', () => {
        const onOpenChange = vi.fn();
        act(() => root.render(<MainMenu onOpenChange={onOpenChange} />));
        open();
        open();
        expect(onOpenChange.mock.calls.map(([value]) => value)).toEqual([false, true, false]);
    });
});
