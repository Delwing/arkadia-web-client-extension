import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { apply, defaultUiSettings } from '@web/uiSettingsCore';
import type { ColorTheme } from '@shared/uiSettingsTypes';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const bridgeCss = read('src/web/themes/bridge.css');
const styleCss = read('src/web/style.css');
const scalesCss = read('src/ui/design/css/scales.generated.css');
const tokensCss = read('src/ui/design/css/tokens.css');

const LEGACY_THEME_FILES = [
    'dark-neutral',
    'fantasy',
    'forest',
    'gray',
    'icy',
    'light-parchment',
    'light-silver',
].map((name) => `src/web/themes/${name}.css`);

/** Every `--x: value` declaration in a stylesheet. */
function declaredVariables(css: string): Set<string> {
    return new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]));
}

/** Every `var(--x)` reference in a stylesheet. */
function referencedVariables(css: string): Set<string> {
    return new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1]));
}

/**
 * Zmienne rolowe starej warstwy: wszystko z prefiksem --popup- i --footer-
 * poza kategoryczna paleta --popup-data-, ktorej most swiadomie nie przejmuje
 * (patrz naglowek bridge.css).
 */
function legacyRoleVariables(css: string): string[] {
    return [...declaredVariables(css)]
        .filter((name) => name.startsWith('--popup-') || name.startsWith('--footer-'))
        .filter((name) => !name.startsWith('--popup-data-'))
        .sort();
}

describe('most --popup-* -> --ark-*', () => {
    test('przejmuje dokladnie zmienne rolowe zdefiniowane w :root', () => {
        // Zmienna rolowa, ktorej most nie przejmuje, zostaje w starym kolorze i
        // robi wyspe w srodku przemalowanego ekranu - a tego nikt nie zauwazy
        // ani w buildzie, ani w testach jednostkowych.
        expect(legacyRoleVariables(bridgeCss)).toEqual(legacyRoleVariables(styleCss));
    });

    test.each(LEGACY_THEME_FILES)('pokrywa role, ktore nadpisuje %s', (path) => {
        const bridged = new Set(legacyRoleVariables(bridgeCss));
        const missing = legacyRoleVariables(read(path)).filter((name) => !bridged.has(name));
        expect(missing).toEqual([]);
    });

    test('siega wylacznie po tokeny, ktore system projektowy naprawde deklaruje', () => {
        const defined = new Set([...declaredVariables(scalesCss), ...declaredVariables(tokensCss)]);
        const missing = [...referencedVariables(bridgeCss)]
            .filter((name) => name.startsWith('--ark-'))
            .filter((name) => !defined.has(name));
        expect(missing).toEqual([]);
    });

    test('nie zawiera wartosci szesnastkowych', () => {
        expect([...bridgeCss.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0])).toEqual([]);
    });

    test('niesie wlasne kryterium usuniecia', () => {
        expect(bridgeCss).toContain('KRYTERIUM USUNIECIA');
        expect(bridgeCss).toContain('var(--popup-');
    });

    test('jest wpiety po starych motywach', () => {
        const mainTheme = read('src/web/main-theme.css');
        expect(mainTheme.indexOf("./themes/bridge.css")).toBeGreaterThan(
            mainTheme.indexOf("./themes/light-silver.css"),
        );
        expect(mainTheme.indexOf('../ui/design/css/index.css')).toBeLessThan(
            mainTheme.indexOf('bootswatch/dist/darkly/bootstrap.min.css'),
        );
    });
});

/**
 * Mapowanie starego wyboru motywu na motyw systemu projektowego. Tablica w
 * uiSettingsCore jest prywatna, wiec sprawdzamy ja po skutku - przez atrybut,
 * ktory faktycznie laduje na <body>.
 */
const EXPECTED_ARK_THEME: Record<ColorTheme, string> = {
    'default': 'arkadia',
    'dark-neutral': 'dark-neutral',
    'fantasy': 'fantasy',
    'forest': 'forest',
    'icy': 'icy',
    'gray': 'gray',
    'light-parchment': 'parchment',
    'light-silver': 'silver',
    'custom-dark': 'custom',
};

describe('data-ark-theme obok klasy theme-*', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-ark-theme');
        document.body.className = '';
    });

    test.each(Object.entries(EXPECTED_ARK_THEME))('colorTheme %s -> %s', (colorTheme, expected) => {
        apply({ ...defaultUiSettings, colorTheme: colorTheme as ColorTheme, customThemeColor: '#58b0e8' });

        expect(document.body.getAttribute('data-ark-theme')).toBe(expected);
    });

    test('stara klasa motywu zostaje na miejscu', () => {
        apply({ ...defaultUiSettings, colorTheme: 'fantasy' });
        expect(document.body.classList.contains('theme-fantasy')).toBe(true);

        apply({ ...defaultUiSettings, colorTheme: 'custom-dark', customThemeColor: '#58b0e8' });
        expect(document.body.classList.contains('theme-custom-dark')).toBe(true);
        expect(document.body.classList.contains('theme-fantasy')).toBe(false);
    });

    test('"default" nie dostaje zadnej starej klasy, ale dostaje motyw arkadia', () => {
        apply({ ...defaultUiSettings, colorTheme: 'default' });

        expect(document.body.className).toBe('');
        expect(document.body.getAttribute('data-ark-theme')).toBe('arkadia');
    });

    test('kolor wlasny dostaje motyw-dawce na <html> i pelna rampe w <style>', () => {
        apply({ ...defaultUiSettings, colorTheme: 'custom-dark', customThemeColor: '#58b0e8' });

        // Blok "custom" daje tylko szarosci i akcent; statusy i przezroczyste
        // czernie musi dostarczyc motyw-dawca, inaczej znikaja z ekranu.
        expect(document.documentElement.getAttribute('data-ark-theme')).toBe('arkadia');

        const style = document.getElementById('ark-custom-theme');
        expect(style?.textContent).toContain('[data-ark-theme="custom"]');
        expect(style?.textContent).toContain('--ark-accent-9');
    });

    test('wyjscie z koloru wlasnego sprzata dawce i wstrzykniety <style>', () => {
        apply({ ...defaultUiSettings, colorTheme: 'custom-dark', customThemeColor: '#58b0e8' });
        apply({ ...defaultUiSettings, colorTheme: 'forest' });

        expect(document.documentElement.hasAttribute('data-ark-theme')).toBe(false);
        expect(document.getElementById('ark-custom-theme')).toBeNull();
    });
});
