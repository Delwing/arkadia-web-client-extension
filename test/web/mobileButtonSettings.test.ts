import { beforeEach, describe, expect, it } from 'vitest';
import {
    MOBILE_BUTTONS_V1_BACKUP_KEY,
    createDefaultLayout,
    loadSettings,
    migrateMobileButtonsToV2,
    mobileButtonFontSize,
    saveSettings,
} from '@web/mobileButtonSettings.ts';

function stored() {
    return JSON.parse(localStorage.getItem('mobileButtonSettings')!);
}

function v1(overrides: Record<string, unknown> = {}) {
    const solo = createDefaultLayout();
    const team = JSON.parse(JSON.stringify(solo));
    team.buttons['button-2'] = { ...team.buttons['button-2'], label: 'atak', macroType: 'attackEnemy' };
    return { solo, team, leader: JSON.parse(JSON.stringify(team)), locked: true, buttonSize: 44, radial: { enabled: false, commands: [] }, ...overrides };
}

describe('mobile button settings v2', () => {
    beforeEach(() => localStorage.clear());

    it('loads defaults as v2 with resolved views', () => {
        const settings = loadSettings();

        expect(settings.version).toBe(2);
        expect(settings.modes.team).toEqual({ buttons: {} });
        expect(settings.team.order).toEqual(settings.solo.order);
        expect(settings.solo.buttons['n-button'].color).toBe('#2a4d6e');
    });

    it('migrates stored v1 data on read without writing it', () => {
        localStorage.setItem('mobileButtonSettings', JSON.stringify(v1()));

        const settings = loadSettings();

        expect(Object.keys(settings.modes.team.buttons)).toEqual(['button-2']);
        expect(settings.leader.buttons['button-2'].label).toBe('atak');
        expect(settings.locked).toBe(true);
        expect(settings.buttonSize).toBe(44);
        expect(stored().version).toBeUndefined();
    });

    it('persists v2 with the views as a v1 mirror on startup, keeping one backup', () => {
        const raw = JSON.stringify(v1());
        localStorage.setItem('mobileButtonSettings', raw);

        migrateMobileButtonsToV2();

        expect(stored().version).toBe(2);
        expect(stored().team.buttons['button-2'].label).toBe('atak');
        expect(localStorage.getItem(MOBILE_BUTTONS_V1_BACKUP_KEY)).toBe(raw);

        localStorage.setItem('mobileButtonSettings', JSON.stringify(v1({ buttonSize: 50 })));
        migrateMobileButtonsToV2();
        expect(localStorage.getItem(MOBILE_BUTTONS_V1_BACKUP_KEY)).toBe(raw);
    });

    it('leaves v2 data alone on startup', () => {
        saveSettings(loadSettings());
        const before = localStorage.getItem('mobileButtonSettings');

        migrateMobileButtonsToV2();

        expect(localStorage.getItem('mobileButtonSettings')).toBe(before);
        expect(localStorage.getItem(MOBILE_BUTTONS_V1_BACKUP_KEY)).toBeNull();
    });

    it('keeps modes and styles when only shared settings change', () => {
        localStorage.setItem('mobileButtonSettings', JSON.stringify(v1()));
        const settings = loadSettings();
        settings.styles[settings.styleOrder[0]].name = 'Moja paleta';
        saveSettings(settings);

        saveSettings({ ...loadSettings(), locked: false });

        expect(stored().styles[stored().styleOrder[0]].name).toBe('Moja paleta');
        expect(stored().locked).toBe(false);
    });

    it('re-derives modes when an editor changed a view, reusing matching styles', () => {
        saveSettings(loadSettings());
        const settings = loadSettings();
        const kierunki = settings.styleOrder[1];
        settings.styles[kierunki].name = 'Strzałki';
        saveSettings(settings);

        const edited = loadSettings();
        edited.leader.buttons['go-button'] = { ...edited.leader.buttons['go-button'], label: '/prze' };
        saveSettings(edited);

        const after = loadSettings();
        expect(Object.keys(after.modes.leader.buttons)).toEqual(['go-button']);
        expect(after.modes.team.buttons).toEqual({});
        expect(after.styles[kierunki].name).toBe('Strzałki');
    });

    it('accepts a v1 object, as a device bundle from an old client sends it', () => {
        saveSettings(v1() as any);

        expect(stored().version).toBe(2);
        expect(Object.keys(stored().modes.team.buttons)).toEqual(['button-2']);
    });

    it('falls back to the mirror when the v2 part is broken', () => {
        const saved = { ...v1(), version: 2, modes: { solo: { buttons: {} } }, styles: {} };
        localStorage.setItem('mobileButtonSettings', JSON.stringify(saved));

        expect(loadSettings().team.buttons['button-2'].label).toBe('atak');
    });
});

describe('mobileButtonFontSize', () => {
    it('gives arrows a fixed share of the button', () => {
        expect(mobileButtonFontSize('n', false, 36)).toBe(13);
    });

    it('shrinks text labels only as far as their longest word needs', () => {
        expect(mobileButtonFontSize('/z', true, 36)).toBe(13);
        expect(mobileButtonFontSize('/za cel', true, 36)).toBe(13);
        expect(mobileButtonFontSize('wesprzyj', true, 36)).toBe(9);
    });

    it('fits every word of a long label on its own line', () => {
        expect(mobileButtonFontSize('a b c d', true, 36)).toBe(7);
    });

    it('never goes below 6px', () => {
        expect(mobileButtonFontSize('przeciwuderzeniowy', true, 36)).toBe(6);
    });
});
