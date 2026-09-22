export type UiFontSelection = 'default' | 'fira-code' | 'jetbrains-mono' | 'cascadia-mono' | 'vera-sans-mono' | 'custom';

// Bitstream Vera Sans Mono is self-hosted (fonts/vera-sans-mono.css), so it has no stylesheet here.
const fontStylesheets: Partial<Record<UiFontSelection, string>> = {
    'fira-code': 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap',
    'jetbrains-mono': 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap',
    'cascadia-mono': 'https://fonts.googleapis.com/css2?family=Cascadia+Mono:wght@400;500;600;700&display=swap',
};

const loadedFonts = new Map<UiFontSelection, string>();

export function isUiFontSelection(value: unknown): value is UiFontSelection {
    return value === 'default'
        || value === 'fira-code'
        || value === 'jetbrains-mono'
        || value === 'cascadia-mono'
        || value === 'vera-sans-mono'
        || value === 'custom';
}

export function ensureFontLoaded(selection: UiFontSelection, customHref?: string) {
    if (typeof document === 'undefined') {
        return;
    }
    if (selection === 'default') {
        return;
    }
    const href = selection === 'custom'
        ? customHref?.trim()
        : fontStylesheets[selection];
    if (!href) {
        if (selection === 'custom') {
            const existingLink = document.querySelector<HTMLLinkElement>(`link[data-ui-font='${selection}']`);
            existingLink?.remove();
            loadedFonts.delete(selection);
        }
        return;
    }
    const existing = document.querySelector<HTMLLinkElement>(`link[data-ui-font='${selection}']`);
    if (existing) {
        const currentHref = existing.getAttribute('href');
        if (currentHref === href) {
            return;
        }
        existing.remove();
        if (loadedFonts.get(selection) === currentHref) {
            loadedFonts.delete(selection);
        }
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.uiFont = selection;
    link.addEventListener('load', () => {
        loadedFonts.set(selection, href);
    });
    link.addEventListener('error', () => {
        if (loadedFonts.get(selection) === href) {
            loadedFonts.delete(selection);
        }
        link.remove();
    });
    document.head.appendChild(link);
}

/** CSS font-family stack for a font selection, or undefined for the system default. */
export function resolveOutputFontFamily(selection: UiFontSelection, customFontFamily: string): string | undefined {
    switch (selection) {
    case 'fira-code':
        return '"Fira Code", monospace';
    case 'jetbrains-mono':
        return '"JetBrains Mono", monospace';
    case 'cascadia-mono':
        return '"Cascadia Mono", monospace';
    case 'vera-sans-mono':
        return '"Bitstream Vera Sans Mono", monospace';
    case 'custom': {
        const trimmed = customFontFamily.trim();
        if (!trimmed) {
            return undefined;
        }
        const normalized = /['",]/.test(trimmed)
            ? trimmed
            : `"${trimmed}"`;
        return `${normalized}, monospace`;
    }
    default:
        return undefined;
    }
}
