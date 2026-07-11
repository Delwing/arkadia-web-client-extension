import { getUiPort } from './ports';

function isTextField(el: Element | null): boolean {
    if (!el) return false;
    const html = el as HTMLElement;
    return (typeof html.matches === 'function' && html.matches('input, textarea')) ||
        html.isContentEditable === true;
}

function isCommandInput(el: Element | null): boolean {
    const html = el as HTMLElement | null;
    return !!html && typeof html.matches === 'function' && html.matches('[data-command-input]');
}

/**
 * Whether a global keybind (direction keys, functional binds, …) should be
 * ignored for the current focus / UI state — the single, UI-agnostic guard every
 * keybind consumer shares.
 *
 * The command input opts back in by carrying a `data-command-input` attribute, so
 * binds still fire while the command line has focus. Otherwise we suppress while
 * a text field is focused, or when the active UI reports it should (e.g. an open
 * modal, via the injected `UiPort.shouldSuppressKeys` hook). Different UIs use
 * different command-input ids and modal frameworks, so neither is hard-coded.
 */
export function shouldIgnoreGlobalKeybind(): boolean {
    const active = document.activeElement;
    if (isCommandInput(active)) return false;
    if (isTextField(active)) return true;
    return getUiPort().shouldSuppressKeys?.() ?? false;
}
