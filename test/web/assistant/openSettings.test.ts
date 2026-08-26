/**
 * The "open the panel for me" path.
 *
 * Some settings are drag-and-drop or nested-config editors the assistant is not
 * allowed to author, so `proposalValidator` rejects them with
 * `settingNotAssistantEditable`. Those rejections used to be counted as
 * "Odrzucono N niepoprawnych propozycji" — which was wrong on both halves: the
 * model had found the right setting and said the right thing in prose, and the
 * line gave the user nothing to do about it.
 *
 * They now render a card with a button that opens the owning dialog. Two things
 * have to hold for that button to go anywhere, and both are checked here:
 * the settings key has to survive validation failure, and it has to route to the
 * right one of the two settings dialogs.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { settingKeyOf } from '@web/assistant/assistantClient.ts';
import {
    OPEN_SETTINGS_EVENT,
    openSettingsFor,
    surfaceFor,
    tabLabelOf,
    type OpenSettingsDetail,
} from '@web/assistant/openSettings.ts';
import bundleJson from '../../../public/assistant-kb.json';
import type { KnowledgeBundle } from '@shared/assistant/knowledgeBundle.ts';
import { validateProposal } from '@modules/core/assistant/proposalValidator.ts';

const bundleSettings = (bundleJson as unknown as KnowledgeBundle).settings;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('settingKeyOf', () => {
    it('recovers the key from a proposal the validator rejects', () => {
        // The exact case from live use: the model proposed reordering the footer,
        // which is a drag-and-drop editor.
        const raw = { kind: 'settings', key: 'uiSettings.footerComponents', value: [], label: 'x' };

        const result = validateProposal({ kind: 'settingChange', key: 'uiSettings.footerComponents', value: [] });
        expect(result.ok).toBe(false);
        expect(result.issues.map(i => i.code)).toContain('settingNotAssistantEditable');
        // `proposal` is deliberately absent on failure, which is why the key has
        // to be carried separately for the card to have a destination.
        expect(result.proposal).toBeUndefined();

        expect(settingKeyOf(raw)).toBe('uiSettings.footerComponents');
    });

    it('accepts the legacy wire spelling of the kind', () => {
        expect(settingKeyOf({ kind: 'settings', key: 'settings.shortenExits', value: true }))
            .toBe('settings.shortenExits');
        expect(settingKeyOf({ kind: 'settingChange', key: 'settings.shortenExits', value: true }))
            .toBe('settings.shortenExits');
    });

    it('returns undefined for non-settings proposals and junk', () => {
        expect(settingKeyOf({ kind: 'alias', pattern: 'x', command: 'y' })).toBeUndefined();
        expect(settingKeyOf({ kind: 'settingChange', value: 1 })).toBeUndefined();
        expect(settingKeyOf(null)).toBeUndefined();
        expect(settingKeyOf('nonsense')).toBeUndefined();
    });
});

describe('surfaceFor', () => {
    it('routes UI slices to the interface dialog', () => {
        for (const key of [
            'uiSettings.footerComponents',
            'uiSettings.barOrder',
            'renderSettings.soundCategories',
            'shellSettings.anything',
            'mapSettings.anything',
            'behaviorSettings.anything',
        ]) {
            expect(surfaceFor(key), key).toBe('ui');
        }
    });

    it('routes everything else to the character options dialog', () => {
        for (const key of [
            'settings.collectOverrides',
            'settings.languageAliases',
            'settings.zlomSilver',
        ]) {
            expect(surfaceFor(key), key).toBe('character');
        }
    });
});

describe('tabLabelOf', () => {
    it('takes the tab from a navigation path', () => {
        // Opening the dialog was not enough — it landed on whatever tab it was
        // last on. The path names the tab, and both dialogs put it third.
        expect(tabLabelOf('Menu (⋮) → Interfejs (Ustawienia UI) → Stopka → Elementy stopki'))
            .toBe('Stopka');
        expect(tabLabelOf('Menu (⋮) → Ustawienia (Opcje) → Ogolne → Walka'))
            .toBe('Ogolne');
    });

    it('is undefined for a path with no tab segment', () => {
        expect(tabLabelOf(undefined)).toBeUndefined();
        expect(tabLabelOf('Menu (⋮) → Interfejs (Ustawienia UI)')).toBeUndefined();
    });

    it('agrees with the tab labels the character options dialog renders', () => {
        // Same check as the UI one below: a path naming a tab the dialog does not
        // have would open on the wrong tab, silently.
        const RENDERED_CHARACTER_TABS = ['Ogólne', 'Gildie', 'Walka', 'Bindy wrogów', 'Magiki'];
        const tabs = new Set(
            bundleSettings
                .filter(s => s.uiLocation?.includes('Ustawienia (Opcje)'))
                .map(s => tabLabelOf(s.uiLocation))
                .filter((label): label is string => Boolean(label)),
        );
        expect(tabs.size).toBeGreaterThan(0);
        for (const label of tabs) {
            expect(RENDERED_CHARACTER_TABS, `path names tab "${label}"`).toContain(label);
        }
    });

    it('resolves a section that shares its name with a tab to the parent tab', () => {
        // "Walka" is both a tab and a section inside Ogolne. Taking the third
        // segment is what keeps `Ogolne -> Walka` off the Walka tab.
        expect(tabLabelOf('Menu (⋮) → Ustawienia (Opcje) → Ogólne → Walka')).toBe('Ogólne');
    });

    it('agrees with the tab labels the UI settings dialog actually renders', () => {
        // The dialog maps this label to its own private tab id. If a path ever
        // named a tab the dialog does not have, the button would open the dialog
        // on the wrong tab with no error.
        const RENDERED_UI_TABS = ['Ogólne', 'Stopka', 'Mapa', 'Dźwięk'];
        const uiTabs = new Set(
            bundleSettings
                .filter(s => s.uiLocation?.includes('Interfejs'))
                .map(s => tabLabelOf(s.uiLocation))
                .filter((label): label is string => Boolean(label)),
        );
        for (const label of uiTabs) {
            expect(RENDERED_UI_TABS, `path names tab "${label}"`).toContain(label);
        }
    });
});

describe('openSettingsFor', () => {
    it('dispatches the key and its surface', () => {
        const seen: OpenSettingsDetail[] = [];
        const listener = (event: Event) => seen.push((event as CustomEvent<OpenSettingsDetail>).detail);
        window.addEventListener(OPEN_SETTINGS_EVENT, listener);

        openSettingsFor('uiSettings.footerComponents');
        openSettingsFor('settings.collectOverrides');

        window.removeEventListener(OPEN_SETTINGS_EVENT, listener);

        expect(seen).toEqual([
            { settingKey: 'uiSettings.footerComponents', surface: 'ui' },
            { settingKey: 'settings.collectOverrides', surface: 'character' },
        ]);
    });

    it('does not throw when no host is listening', () => {
        // Forge has its own modal host and may not implement the event. The card
        // still shows the navigation path as text, so a silent no-op is correct —
        // but it must not take the panel down with it.
        expect(() => openSettingsFor('uiSettings.barOrder')).not.toThrow();
    });
});
