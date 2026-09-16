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
 * They now render a card with a button that opens the settings dialog. Two
 * things have to hold for that button to go anywhere, and both are checked here:
 * the settings key has to survive validation failure, and it has to route to the
 * right group and page of the dialog.
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
import { SETTINGS_GROUP_LABELS, settingsCategoryByLabel } from '@web/settings/categories.ts';
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
    it('takes the page from a navigation path', () => {
        // Opening the dialog was not enough — it landed on whatever page it was
        // last on. The path names the page, always as the fourth segment.
        expect(tabLabelOf('Menu (⋮) → Ustawienia → Interfejs → Stopka → Elementy stopki'))
            .toBe('Stopka');
        expect(tabLabelOf('Menu (⋮) → Ustawienia → Postać → Ogólne → Język'))
            .toBe('Ogólne');
    });

    it('is undefined for a path with no page segment', () => {
        expect(tabLabelOf(undefined)).toBeUndefined();
        expect(tabLabelOf('Menu (⋮) → Ustawienia → Interfejs')).toBeUndefined();
    });

    it('resolves a section that shares its name with a page to the parent page', () => {
        // "Walka" is both a page and a section on it; "Inne" likewise. Taking the
        // fourth segment keeps the section name from being read as the page.
        expect(tabLabelOf('Menu (⋮) → Ustawienia → Postać → Walka → Walka')).toBe('Walka');
        expect(tabLabelOf('Menu (⋮) → Ustawienia → Interfejs → Inne → Inne')).toBe('Inne');
    });

    it('agrees with the pages the settings dialog renders, in the right group', () => {
        // The dialog looks the label up in its category list. A path naming a
        // page it does not have, or one from the other group, would open the
        // dialog on the wrong page with no error.
        const paths = bundleSettings
            .map(s => s.uiLocation)
            .filter((loc): loc is string => Boolean(loc?.startsWith('Menu (⋮) → Ustawienia →')));
        expect(paths.length).toBeGreaterThan(40);
        for (const loc of paths) {
            const page = settingsCategoryByLabel(tabLabelOf(loc));
            expect(page, `path "${loc}" names no page`).toBeDefined();
            const group = loc.split('→').map(part => part.trim())[2];
            expect(SETTINGS_GROUP_LABELS[page!.group], `path "${loc}"`).toBe(group);
        }
    });

    it('covers both groups', () => {
        const groups = new Set(bundleSettings
            .map(s => settingsCategoryByLabel(tabLabelOf(s.uiLocation))?.group)
            .filter(Boolean));
        expect([...groups].sort()).toEqual(['character', 'ui']);
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
