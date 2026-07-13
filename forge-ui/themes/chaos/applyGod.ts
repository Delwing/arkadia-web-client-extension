/**
 * Chaos-god theme switch (dev-only, forge-ui-local).
 *
 * Selects one of the four Chaos-god reskins (see chaos.css) by setting
 * `data-god` on <html>. There is no settings UI yet — the god is chosen via:
 *   1. a `?god=<name>` URL query param (also persisted for next load), or
 *   2. the `forge-god` localStorage key.
 *
 * `?god=off` (or `none`) clears the choice and returns to stock Forged.
 * Persistence is forge-ui-LOCAL (localStorage) and never touches the shared,
 * synced settings store — consistent with the alt-ui keeping UI settings local.
 *
 * From the console you can also flip it live:  ArkadiaGod('khorne')
 */

const GODS = ['khorne', 'nurgle', 'tzeentch', 'slaanesh'] as const;
type God = (typeof GODS)[number];

const STORAGE_KEY = 'forge-god';

function isGod(v: string | null): v is God {
    return v !== null && (GODS as readonly string[]).includes(v);
}

/** Resolve the active god from URL param (wins + persists) then localStorage. */
function resolveGod(): God | null {
    let fromUrl: string | null = null;
    try {
        fromUrl = new URLSearchParams(window.location.search).get('god');
    } catch {
        /* malformed URL — ignore */
    }

    if (fromUrl !== null) {
        if (isGod(fromUrl)) {
            try {
                localStorage.setItem(STORAGE_KEY, fromUrl);
            } catch {
                /* storage unavailable — still apply for this session */
            }
            return fromUrl;
        }
        if (fromUrl === 'off' || fromUrl === 'none' || fromUrl === '') {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch {
                /* ignore */
            }
            return null;
        }
    }

    let saved: string | null = null;
    try {
        saved = localStorage.getItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
    return isGod(saved) ? saved : null;
}

/** Apply (or clear) the god theme by toggling the <html> data attribute. */
export function applyGod(god: God | null): void {
    const el = document.documentElement;
    if (god) el.dataset.god = god;
    else delete el.dataset.god;
}

applyGod(resolveGod());

// Console helper for quick live switching during development.
declare global {
    interface Window {
        ArkadiaGod?: (god: string) => void;
    }
}
window.ArkadiaGod = (god: string) => {
    if (isGod(god)) {
        try {
            localStorage.setItem(STORAGE_KEY, god);
        } catch {
            /* ignore */
        }
        applyGod(god);
    } else {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
        applyGod(null);
    }
};
