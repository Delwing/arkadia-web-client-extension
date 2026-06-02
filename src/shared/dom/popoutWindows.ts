/**
 * Registry of open popout windows (panels detached into their own browser
 * window). Lets shared DOM helpers target the *focused* window rather than the
 * main one — important for window-scoped browser APIs like the clipboard,
 * which only work from the focused document.
 *
 * Without this, a screenshot/copy triggered from a popped-out panel runs in the
 * main window's JS realm and calls the main window's `navigator.clipboard`,
 * which the browser rejects because the popout (not the opener) is focused.
 */
const popoutWindows = new Set<Window>();

export function registerPopoutWindow(win: Window): void {
  popoutWindows.add(win);
}

export function unregisterPopoutWindow(win: Window): void {
  popoutWindows.delete(win);
}

/**
 * The app window that currently has focus — a popout if one is focused,
 * otherwise the main window. Used by helpers that must act on the window the
 * user is actually interacting with (e.g. clipboard writes).
 */
export function getActiveAppWindow(): Window {
  for (const win of popoutWindows) {
    try {
      if (!win.closed && win.document.hasFocus()) return win;
    } catch {
      // Window torn down / inaccessible — skip it.
    }
  }
  return window;
}
