/**
 * Fonts installed on the player's system.
 *
 * Any installed family works by name in CSS. Listing them needs the Local Font
 * Access API (Chrome/Edge only, behind a permission prompt), so the list is an
 * optional convenience over typing the name.
 */

interface LocalFontData {
    family: string;
}

type QueryLocalFonts = () => Promise<LocalFontData[]>;

function queryLocalFonts(): QueryLocalFonts | undefined {
    const fn = (globalThis as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
    return typeof fn === 'function' ? fn : undefined;
}

export function canListSystemFonts(): boolean {
    return queryLocalFonts() !== undefined;
}

/** Installed family names, sorted; throws when the permission is refused. */
export async function listSystemFontFamilies(): Promise<string[]> {
    const query = queryLocalFonts();
    if (!query) return [];
    const fonts = await query.call(globalThis);
    const families = new Set<string>();
    for (const f of fonts) {
        if (f.family) families.add(f.family);
    }
    return [...families].sort((a, b) => a.localeCompare(b));
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/**
 * Whether the browser can find a font by this name: a family it cannot find
 * falls back, so it measures the same as the bare fallback under two
 * different fallbacks. Undefined when text cannot be measured here.
 */
export function isFontAvailable(family: string): boolean | undefined {
    const name = family.trim().replace(/^["']|["']$/g, '');
    if (!name || typeof document === 'undefined') return undefined;
    if (measureContext === undefined) {
        try {
            measureContext = document.createElement('canvas').getContext('2d');
        } catch {
            measureContext = null;
        }
    }
    const ctx = measureContext;
    if (!ctx) return undefined;
    const sample = 'mmmmmmmmmmlli1WQ@#';
    const width = (font: string) => {
        ctx.font = `32px ${font}`;
        return ctx.measureText(sample).width;
    };
    const quoted = `"${name.replace(/"/g, '')}"`;
    let measurable = false;
    for (const fallback of ['monospace', 'serif', 'sans-serif']) {
        const base = width(fallback);
        if (base > 0) measurable = true;
        if (width(`${quoted}, ${fallback}`) !== base) return true;
    }
    return measurable ? false : undefined;
}

/** The local-fonts permission, or undefined where the browser cannot tell. */
export async function systemFontPermission(): Promise<PermissionState | undefined> {
    try {
        const status = await navigator.permissions?.query({ name: 'local-fonts' as PermissionName });
        return status?.state;
    } catch {
        return undefined;
    }
}
