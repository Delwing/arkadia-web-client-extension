import {characterStorage} from "@modules/core/storage";
import type {DisabledScriptStore} from "./ScriptRegistry";

/**
 * The scripts this character has turned off.
 *
 * Per character rather than global: which features are wanted genuinely differs
 * between a fighter and a herbalist, and the per-character sync path already
 * exists. See docs/SCRIPT_DEPENDENCIES.md, *Decisions* §4.
 *
 * Only ids the user turned off by hand are stored. Anything switched off because
 * something it `requires` is off is derived by the registry, so re-enabling the
 * dependency brings its dependants back without a second round of bookkeeping —
 * and a stored cascade could never be told apart from a deliberate choice.
 */
export const characterDisabledScripts: DisabledScriptStore = {
    read(): string[] {
        const stored = characterStorage.get('disabled_scripts');
        return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : [];
    },
    write(ids: string[]): void {
        characterStorage.set('disabled_scripts', ids);
    },
};
