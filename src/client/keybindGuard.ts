import { getHostPort, getUiPort } from './ports';

/**
 * Whether a global keybind (direction keys, functional binds, …) should be
 * ignored for the current focus / UI state — the single, UI-agnostic guard every
 * keybind consumer shares.
 *
 * We suppress while the player types in a text field other than the command
 * line (the host knows which that is), or when the active UI reports it should
 * (e.g. an open modal, via the injected `UiPort.shouldSuppressKeys` hook).
 */
export function shouldIgnoreGlobalKeybind(): boolean {
    if (getHostPort().isTypingInTextField()) return true;
    return getUiPort().shouldSuppressKeys?.() ?? false;
}
