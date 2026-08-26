/**
 * The one place an assistant proposal is persisted.
 *
 * Nothing here runs without an explicit "Zastosuj" click, and everything that
 * reaches it has already passed `validateProposal`. Each branch uses the exact
 * call the settings UI uses for the same data, because the traps are all in the
 * difference:
 *
 * - **Persisting a UI setting is not applying it.** `save()` fans a `UiSettings`
 *   object out to five storage keys, but the live effect (fonts, colours, map,
 *   chrome) comes from `apply()`, which is otherwise called only by
 *   `UiSettings.tsx` on its own local draft — a component that under forge is
 *   usually not even mounted. `save()` without `apply()` persists, syncs, and
 *   visibly does nothing until reload.
 * - **A bind written to `keymaps` alone is dead.** `saveKeymapBinds` also writes
 *   the `binds` key when the keymap is the active one, and that second write is
 *   what wakes `KeyBindingManager`, `directionBinds`, `enemyBinds` and
 *   `multibinds`.
 * - **Character settings are one flat blob.** `TypedStorage.set` replaces the
 *   value, so the whole `settings` object must be read, patched and rewritten.
 *
 * Raw `localStorage.setItem` is never used: it fires no listeners in this tab
 * (no live update) and does not trip the Firebase sync trigger, producing the
 * "other tabs updated, this one didn't" asymmetry.
 */

import { characterStorage, globalStorage } from '@modules/core/storage.ts';
import type { Settings } from '@modules/core/defaultSettings.ts';
import { lookupSetting } from '@modules/core/assistant/settingsRegistry.ts';
import type {
    AliasProposal,
    AssistantProposal,
    BindProposal,
    SettingChangeProposal,
    TriggerProposal,
} from '@modules/core/assistant/proposalValidator.ts';
import {
    getActiveBindSettings,
    getActiveKeymapId,
    mergeBindSettings,
    saveKeymapBinds,
} from '@modules/core/keymapStorage.ts';
import type { UserAlias } from '@client/scripts/userAliases.ts';
import type { UserTrigger } from '@client/scripts/userTriggers.ts';
import { apply as applyUiSettings, load as loadUiSettings, save as saveUiSettings } from '@web/uiSettingsCore.ts';
import { normalizeTriggerList } from '@web/options/userTriggerNormalize.ts';

export interface ApplyResult {
    ok: boolean;
    /** Polish, ASCII-only confirmation or failure message for the card. */
    message: string;
}

export function applyProposal(proposal: AssistantProposal): ApplyResult {
    try {
        switch (proposal.kind) {
            case 'settingChange': return applySettingChange(proposal);
            case 'alias': return applyAlias(proposal);
            case 'trigger': return applyTrigger(proposal);
            case 'bind': return applyBind(proposal);
        }
    } catch (err) {
        console.error('Nie udalo sie zastosowac propozycji asystenta', err);
        return { ok: false, message: 'Nie udalo sie zapisac zmiany. Szczegoly w konsoli.' };
    }
}

// ---------------------------------------------------------------------------

function applySettingChange(proposal: SettingChangeProposal): ApplyResult {
    const lookup = lookupSetting(proposal.key);
    if (lookup.status !== 'found') {
        return { ok: false, message: `Nie ma juz ustawienia "${proposal.key}".` };
    }
    const descriptor = lookup.descriptor;

    if (descriptor.scope === 'settings') {
        // Read-modify-write of the whole blob is mandatory: TypedStorage.set
        // replaces the value. Mirrors CharacterSettings.tsx.
        const current = characterStorage.get('settings') ?? ({} as Settings);
        characterStorage.set('settings', {
            ...current,
            [descriptor.field]: proposal.value,
        } as Settings);
        return { ok: true, message: `Zmieniono ustawienie postaci: ${descriptor.label ?? descriptor.field}.` };
    }

    // Every other scope is a slice of the unified UiSettings object.
    const next = { ...loadUiSettings(), [descriptor.field]: proposal.value };
    saveUiSettings(next);
    try {
        applyUiSettings(next);
    } catch (err) {
        // Persisted either way; only the live preview failed (e.g. the map
        // renderer is not mounted yet). Never swallow it silently.
        console.error('Ustawienie zapisano, ale nie udalo sie zastosowac na zywo', err);
    }
    return { ok: true, message: `Zmieniono ustawienie interfejsu: ${descriptor.label ?? descriptor.field}.` };
}

function applyAlias(proposal: AliasProposal): ApplyResult {
    const alias: UserAlias = {
        pattern: proposal.pattern,
        command: proposal.command,
        ...(proposal.overrides ? { overrides: proposal.overrides } : {}),
    };
    const list = globalStorage.get('aliases') ?? [];
    const existing = list.findIndex(item => item.pattern === alias.pattern);
    if (existing !== -1) {
        const updated = [...list];
        updated[existing] = alias;
        globalStorage.set('aliases', updated);
        return { ok: true, message: `Nadpisano istniejacy alias "${alias.pattern}".` };
    }
    globalStorage.set('aliases', [...list, alias]);
    return { ok: true, message: `Dodano alias "${alias.pattern}".` };
}

function applyTrigger(proposal: TriggerProposal): ApplyResult {
    const trigger: UserTrigger = {
        type: proposal.type,
        ...(proposal.pattern !== undefined ? { pattern: proposal.pattern } : {}),
        ...(proposal.event !== undefined ? { event: proposal.event } : {}),
        ...(proposal.flags !== undefined ? { flags: proposal.flags } : {}),
        ...(proposal.gmcpMsgType !== undefined ? { gmcpMsgType: proposal.gmcpMsgType } : {}),
        macros: proposal.macros,
    };
    const list = globalStorage.get('triggers') ?? [];
    globalStorage.set('triggers', normalizeTriggerList([...list, trigger]));
    return {
        ok: true,
        message: trigger.type === 'event'
            ? `Dodano trigger na zdarzenie "${trigger.event}".`
            : `Dodano trigger na wzorzec "${trigger.pattern}".`,
    };
}

function applyBind(proposal: BindProposal): ApplyResult {
    const current = getActiveBindSettings();
    const custom = Array.isArray(current.custom) ? current.custom : [];
    const bind = {
        key: proposal.key,
        ...(proposal.ctrl ? { ctrl: true } : {}),
        ...(proposal.alt ? { alt: true } : {}),
        ...(proposal.shift ? { shift: true } : {}),
        command: proposal.command,
    };

    // Mirrors `sanitizeBinds` in Binds.tsx: rows with no key or no command are
    // dead weight and confuse the editor.
    const cleaned = custom.filter(row => row?.key && row?.command);
    const merged = mergeBindSettings({ ...current, custom: [...cleaned, bind] });

    // Writing `keymaps` alone would leave the bind inert until a keymap switch;
    // saveKeymapBinds also writes the active `binds` key, which is what the
    // runtime consumers subscribe to.
    saveKeymapBinds(getActiveKeymapId(), merged);
    return { ok: true, message: `Dodano bind wlasny na klawisz "${proposal.key}".` };
}
