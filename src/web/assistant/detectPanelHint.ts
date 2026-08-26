/**
 * Recognise a settings panel the assistant named in prose.
 *
 * The first version of the "open the panel for me" card hung off a *rejected*
 * proposal (`settingNotAssistantEditable`). That turned out to be backwards: the
 * knowledge bundle tells the model to point at the panel instead of proposing a
 * change for these settings, so a model that follows its instructions emits no
 * proposal at all — and the better it behaves, the less often the card appeared.
 * Observed live: a correct answer about footer bars produced no card, because
 * nothing was rejected.
 *
 * So the trigger is the answer text, not the proposal list. The bundle gives the
 * model navigation paths like
 *
 *   Menu (⋮) → Interfejs (Ustawienia UI) → Stopka → Elementy stopki
 *
 * and the model quotes them back nearly verbatim, because that is what it was
 * given. Matching the answer against the same catalog needs nothing from the
 * model, no new proposal kind, and no prompt change — and it keeps working if a
 * weak model ignores the proposal contract entirely.
 */

import type { KnowledgeBundle, SettingEntry } from '@shared/assistant/knowledgeBundle.ts';

export interface PanelHint {
    /** Registry-form key, for routing to the right dialog. */
    settingKey: string;
    label: string;
    uiLocation: string;
}

/**
 * Fold to a comparable form: no diacritics, no case, single spaces.
 *
 * The model writes proper Polish ("Widoczność", "Wygląd") while some catalog
 * strings and user text are ASCII-folded, so comparing raw would miss.
 */
function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ł/g, 'l') // NFD does not decompose l-stroke
        .replace(/Ł/g, 'L')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Whether the button could actually take the user there.
 *
 * Only the two settings dialogs are wired to the open-settings event. A handful
 * of catalog entries point somewhere else entirely — `Menu (⋮) → Przyciski`, or
 * the output window's right-click menu — and offering "Otworz ustawienia" for
 * those would open the wrong dialog, which is worse than offering nothing. The
 * card's text still names the real place.
 */
function isNavigable(uiLocation: string): boolean {
    return uiLocation.includes('Ustawienia (Opcje)') || uiLocation.includes('Interfejs');
}

/** The most specific tail of a path, e.g. "Stopka → Elementy stopki". */
function tailOf(uiLocation: string): string {
    const parts = uiLocation.split('→').map(part => part.trim()).filter(Boolean);
    return parts.slice(-2).join(' → ');
}

/**
 * The panel an answer points at, or null.
 *
 * Full-path matches win over tail matches, and a tail shared by more than one
 * distinct panel is discarded rather than guessed — offering to open the wrong
 * dialog is worse than offering nothing.
 */
export function detectPanelHint(answer: string, bundle: KnowledgeBundle): PanelHint | null {
    const haystack = normalize(answer);
    if (!haystack) return null;

    const withLocation = bundle.settings.filter(
        (entry): entry is SettingEntry & { uiLocation: string } =>
            Boolean(entry.uiLocation) && isNavigable(entry.uiLocation!),
    );

    const toHint = (entry: SettingEntry & { uiLocation: string }): PanelHint => ({
        // The bundle path is `ui.uiSettings.footerComponents`; the registry and the
        // open-settings router both speak `uiSettings.footerComponents`.
        settingKey: entry.path.replace(/^(ui|character)\./, ''),
        label: entry.label ?? entry.key,
        uiLocation: entry.uiLocation,
    });

    for (const entry of withLocation) {
        if (haystack.includes(normalize(entry.uiLocation))) return toHint(entry);
    }

    // Fall back to the last two segments, which is what a model paraphrasing the
    // menu chain usually preserves.
    const byTail = new Map<string, (SettingEntry & { uiLocation: string })[]>();
    for (const entry of withLocation) {
        const tail = normalize(tailOf(entry.uiLocation));
        if (!tail) continue;
        const bucket = byTail.get(tail);
        if (bucket) bucket.push(entry);
        else byTail.set(tail, [entry]);
    }

    for (const [tail, entries] of byTail) {
        if (!haystack.includes(tail)) continue;
        const panels = new Set(entries.map(entry => entry.uiLocation));
        // Several settings sharing one panel is fine — they all open the same
        // dialog. Several *panels* sharing a tail is ambiguous, so skip it.
        if (panels.size === 1) return toHint(entries[0]);
    }

    return null;
}
