// Storage and wire-format helpers for the helper's hotkey binds.
//
// Lives in the helper module (rather than the settings UI that edits them) so
// that the reconnect resync can re-register binds without depending on any
// React component being mounted. See helperResync.ts.

import type { BindAction, BindMode, HelperBind } from "./helperProtocol";

export const HELPER_BINDS_STORAGE_KEY = "arkadia.helperBinds";

export interface StoredBind {
    id: string;
    key: string;
    mode: BindMode;
    action: BindAction;
    command?: string; // for action "command"
    targetBind?: string; // for action "bind" — name of existing bind to trigger
    focusBrowser: boolean;
}

export function loadBinds(): StoredBind[] {
    try {
        const raw = localStorage.getItem(HELPER_BINDS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveBinds(binds: StoredBind[]) {
    localStorage.setItem(HELPER_BINDS_STORAGE_KEY, JSON.stringify(binds));
}

export function toHelperBind(b: StoredBind): HelperBind {
    return {
        id: b.id,
        key: b.key,
        mode: b.mode,
        action: b.action,
        command: b.command,
        remap_to: b.targetBind,
        focus_browser: b.focusBrowser,
    };
}
