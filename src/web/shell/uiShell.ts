/**
 * Which shell (chrome around the game client) the main page boots.
 *
 * The stock page (`index.html`) can host either its own classic chrome or the
 * forge HUD (`forge-ui/`). The choice is per device: it is a look, not a game
 * setting, so it lives in a plain localStorage key outside the synced storage
 * schema and never travels with an export or a device sync.
 *
 * A `?ui=forge` / `?ui=stock` query parameter wins over the stored choice for
 * that one load, without persisting it — handy for trying the other shell or
 * linking straight into it.
 */

export type UiShell = 'stock' | 'forge';

export const UI_SHELLS: readonly UiShell[] = ['stock', 'forge'];

export const UI_SHELL_LABELS: Record<UiShell, string> = {
    stock: 'Klasyczny',
    forge: 'Kuźnia',
};

const STORAGE_KEY = 'uiShell';
const QUERY_PARAM = 'ui';

function isUiShell(value: unknown): value is UiShell {
    return value === 'stock' || value === 'forge';
}

/** The shell stored for this device (`stock` when nothing is stored). */
export function getStoredShell(): UiShell {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return isUiShell(stored) ? stored : 'stock';
    } catch {
        return 'stock';
    }
}

export function setStoredShell(shell: UiShell): void {
    try {
        if (shell === 'stock') localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, shell);
    } catch {
        // Storage blocked: the switch still applies to the reload via the URL.
    }
}

/** The shell asked for in the URL, if any. */
export function getShellFromUrl(search: string = window.location.search): UiShell | null {
    const value = new URLSearchParams(search).get(QUERY_PARAM);
    return isUiShell(value) ? value : null;
}

/** The shell the main page should boot: the URL override, else the stored choice. */
export function resolveBootShell(search: string = window.location.search): UiShell {
    return getShellFromUrl(search) ?? getStoredShell();
}

let activeShell: UiShell = 'stock';

/** Recorded by the page that booted a shell, so shared settings can show it. */
export function setActiveShell(shell: UiShell): void {
    activeShell = shell;
}

/** The shell running on this page. */
export function getActiveShell(): UiShell {
    return activeShell;
}

/**
 * Store `shell` and reload into it. The main page hosts both shells, so it
 * reloads in place (dropping a `?ui=` override that would otherwise win); the
 * standalone forge page (`forge-ui/index.html`) goes to the main page.
 */
export function switchShell(shell: UiShell): void {
    setStoredShell(shell);
    const url = new URL(window.location.href);
    url.searchParams.delete(QUERY_PARAM);
    if (/\/forge-ui\/(index\.html)?$/.test(url.pathname)) {
        url.pathname = url.pathname.replace(/forge-ui\/(index\.html)?$/, '');
    }
    // Assigning an identical URL that carries a #hash only scrolls; reload instead.
    if (url.toString() === window.location.href) window.location.reload();
    else window.location.assign(url.toString());
}
