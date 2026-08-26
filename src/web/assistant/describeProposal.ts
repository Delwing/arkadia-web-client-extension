/**
 * Human-readable Polish rendering of a validated proposal.
 *
 * Kept apart from the card component so the description is testable and so the
 * "what exactly will change" text has one home. Everything here reads storage;
 * nothing writes.
 */

import { characterStorage } from '@modules/core/storage.ts';
import type { Settings } from '@modules/core/defaultSettings.ts';
import { lookupSetting } from '@modules/core/assistant/settingsRegistry.ts';
import type { AssistantProposal } from '@modules/core/assistant/proposalValidator.ts';
import { getActiveBindSettings } from '@modules/core/keymapStorage.ts';
import { describeBind, findBindConflicts, type BindConflict } from '@modules/core/bindConflicts.ts';
import { load as loadUiSettings } from '@web/uiSettingsCore.ts';

export interface ProposalDescription {
    /** Card heading, e.g. "Nowy trigger". */
    title: string;
    /** Label/value rows shown under the heading. */
    rows: { label: string; value: string }[];
    /** Extra warnings computed at describe time (bind conflicts). */
    warnings: string[];
    /**
     * The proposal would leave the setting exactly as it is.
     *
     * A model asked "how do I reorder X" will sometimes answer correctly in prose
     * and then propose the current value back verbatim. It validates, so it
     * reaches the card layer, where it reads as a broken button: "Obecnie" and
     * "Po zmianie" show the same thing and Zastosuj does nothing visible.
     * Suppressed rather than rendered.
     */
    noChange?: boolean;
}

export function formatValue(value: unknown): string {
    if (value === true) return 'wlaczone';
    if (value === false) return 'wylaczone';
    if (value === null || value === undefined) return '(brak)';
    if (typeof value === 'string') return value === '' ? '(pusty tekst)' : value;
    if (Array.isArray(value)) return value.map(formatValue).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/** Current stored value of a setting, for the "z X na Y" row. */
function currentSettingValue(key: string): unknown {
    const lookup = lookupSetting(key);
    if (lookup.status !== 'found') return undefined;
    const descriptor = lookup.descriptor;
    try {
        if (descriptor.scope === 'settings') {
            const settings = characterStorage.get('settings') ?? ({} as Settings);
            return (settings as unknown as Record<string, unknown>)[descriptor.field];
        }
        return (loadUiSettings() as unknown as Record<string, unknown>)[descriptor.field];
    } catch {
        return undefined;
    }
}

const MACRO_LABELS: Record<string, string> = {
    uppercase: 'zamien na wielkie litery',
    color: 'pokoloruj',
    replace: 'zamien tekst',
    beep: 'odtworz dzwiek',
    mute: 'wycisz',
    unmute: 'wlacz dzwiek',
    command: 'wyslij komende',
    slowBlink: 'wolne miganie',
    rapidBlink: 'szybkie miganie',
    dim: 'przyciemnij',
    functionalBind: 'bind funkcjonalny',
    wrap: 'otocz tekstem',
    notify: 'powiadomienie',
};

function describeMacro(macro: { type: string; command?: string; color?: string; to?: string; message?: string; soundKey?: string }): string {
    const label = MACRO_LABELS[macro.type] ?? macro.type;
    const detail = macro.command ?? macro.color ?? macro.to ?? macro.message ?? macro.soundKey;
    return detail ? `${label}: ${detail}` : label;
}

export function describeProposal(proposal: AssistantProposal): ProposalDescription {
    switch (proposal.kind) {
        case 'settingChange': {
            const lookup = lookupSetting(proposal.key);
            const descriptor = lookup.status === 'found' ? lookup.descriptor : undefined;
            const before = currentSettingValue(proposal.key);
            const beforeText = formatValue(before);
            const afterText = formatValue(proposal.value);
            return {
                title: 'Zmiana ustawienia',
                rows: [
                    { label: 'Ustawienie', value: descriptor?.label ?? proposal.key },
                    { label: 'Klucz', value: descriptor?.key ?? proposal.key },
                    { label: 'Obecnie', value: beforeText },
                    { label: 'Po zmianie', value: afterText },
                ],
                warnings: [],
                // Compared on the rendered text rather than by deep equality: it is
                // what the user would actually see, and it sidesteps key ordering
                // and numeric formatting differing between stored and proposed.
                noChange: beforeText === afterText,
            };
        }

        case 'alias':
            return {
                title: 'Nowy alias',
                rows: [
                    { label: 'Wpisujesz', value: proposal.pattern },
                    { label: 'Klient wysyla', value: proposal.command },
                ],
                warnings: [],
            };

        case 'trigger': {
            const rows = [
                {
                    label: 'Uruchamia sie',
                    value: proposal.type === 'event'
                        ? `na zdarzenie "${proposal.event}"`
                        : `gdy linia pasuje do wzorca ${proposal.pattern}`,
                },
            ];
            if (proposal.flags) rows.push({ label: 'Flagi', value: proposal.flags });
            if (proposal.gmcpMsgType) rows.push({ label: 'Tylko dla GMCP', value: proposal.gmcpMsgType });
            rows.push({ label: 'Wykonuje', value: proposal.macros.map(describeMacro).join('; ') });
            return { title: 'Nowy trigger', rows, warnings: [] };
        }

        case 'bind': {
            const conflicts = bindConflictsFor(proposal);
            return {
                title: 'Nowy bind',
                rows: [
                    { label: 'Klawisz', value: describeBind(proposal) },
                    { label: 'Wysyla', value: proposal.command },
                ],
                warnings: conflicts.map(conflict =>
                    `Ten klawisz jest juz zajety: ${conflict.label}${conflict.command ? ` (${conflict.command})` : ''}.`,
                ),
            };
        }
    }
}

function bindConflictsFor(bind: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean }): BindConflict[] {
    try {
        return findBindConflicts(getActiveBindSettings(), bind);
    } catch {
        return [];
    }
}
