/**
 * Recognising a settings panel from the assistant's prose.
 *
 * The first cut of the "open the panel" card triggered on a *rejected* proposal.
 * That was backwards: the knowledge bundle tells the model to point at the panel
 * rather than propose a change for these settings, so a well-behaved model emits
 * no proposal and the card never appeared. The first test below is the exact
 * answer that exposed it, live.
 */

import { describe, expect, it } from 'vitest';
import bundleJson from '../../../public/assistant-kb.json';
import { detectPanelHint } from '@web/assistant/detectPanelHint.ts';
import { surfaceFor } from '@web/assistant/openSettings.ts';
import type { KnowledgeBundle } from '@shared/assistant/knowledgeBundle.ts';

const bundle = bundleJson as unknown as KnowledgeBundle;

/** Verbatim from a live Gemini answer that produced no card. */
const FOOTER_ANSWER =
    'Widoczność pasków w stopce (takich jak HP, mana, zmęczenie czy obciążenie) ' +
    'zmienisz w menu interfejsu. Przejdź do Menu (⋮) → Interfejs (Ustawienia UI) → ' +
    'Stopka → Elementy stopki. Tam możesz włączać, wyłączać i zmieniać kolejność ' +
    'poszczególnych pasków oraz elementów.';

describe('detectPanelHint', () => {
    it('recognises the panel in the answer that shipped without a card', () => {
        const hint = detectPanelHint(FOOTER_ANSWER, bundle);
        expect(hint).not.toBeNull();
        expect(hint!.uiLocation).toContain('Stopka');
        // Must route to the interface dialog, not character options.
        expect(surfaceFor(hint!.settingKey)).toBe('ui');
    });

    it('strips the scope prefix so the key matches the open-settings router', () => {
        const hint = detectPanelHint(FOOTER_ANSWER, bundle);
        // `ui.uiSettings.x` in the bundle; `uiSettings.x` everywhere else.
        expect(hint!.settingKey.startsWith('ui.')).toBe(false);
        expect(hint!.settingKey.startsWith('character.')).toBe(false);
    });

    it('matches despite diacritics differing from the catalog', () => {
        const folded = FOOTER_ANSWER.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
        expect(detectPanelHint(folded, bundle)).not.toBeNull();
    });

    it('matches a paraphrase that keeps only the last two menu steps', () => {
        const hint = detectPanelHint(
            'Znajdziesz to w sekcji Stopka → Elementy stopki.',
            bundle,
        );
        expect(hint).not.toBeNull();
    });

    it('returns null when no panel is named', () => {
        expect(detectPanelHint('Aby zaatakowac przeciwnika, wpisz komende zabij.', bundle)).toBeNull();
        expect(detectPanelHint('', bundle)).toBeNull();
    });

    it('declines paths that are not one of the two settings dialogs', () => {
        // The catalog also points at places the open-settings event does not
        // reach — the buttons dialog, the output window's right-click menu.
        // Offering to open those would open the wrong dialog, which is worse
        // than offering nothing; the card's text still names the real place.
        expect(detectPanelHint('Znajdziesz to w Menu (⋮) → Przyciski.', bundle)).toBeNull();
        expect(
            detectPanelHint('Uzyj Menu kontekstowe (prawy przycisk myszy) w oknie wyjscia.', bundle),
        ).toBeNull();
    });

    it('finds a character-settings panel too, not just interface ones', () => {
        const hint = detectPanelHint(
            'Ustawisz to w Menu (⋮) → Ustawienia (Opcje) → Ogólne → Zbieranie przedmiotów.',
            bundle,
        );
        expect(hint).not.toBeNull();
        expect(surfaceFor(hint!.settingKey)).toBe('character');
    });

    it('never invents a key the settings router cannot place', () => {
        // Every hint must resolve to one of the two dialogs; a key that fell
        // through would render a button that goes nowhere.
        for (const entry of bundle.settings.filter(s => s.uiLocation)) {
            const hint = detectPanelHint(`Przejdz do ${entry.uiLocation}.`, bundle);
            if (!hint) continue;
            expect(['ui', 'character']).toContain(surfaceFor(hint.settingKey));
        }
    });
});
