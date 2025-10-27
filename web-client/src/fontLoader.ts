export type UiFontSelection = 'default' | 'fira-code' | 'jetbrains-mono';

const fontStylesheets: Record<Exclude<UiFontSelection, 'default'>, string> = {
    'fira-code': 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap',
    'jetbrains-mono': 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap',
};

const loadedFonts = new Set<UiFontSelection>();

export function isUiFontSelection(value: unknown): value is UiFontSelection {
    return value === 'default' || value === 'fira-code' || value === 'jetbrains-mono';
}

export function ensureFontLoaded(selection: UiFontSelection) {
    if (typeof document === 'undefined') {
        return;
    }
    if (selection === 'default' || loadedFonts.has(selection)) {
        return;
    }
    const href = fontStylesheets[selection];
    if (!href) {
        return;
    }
    const existing = document.querySelector<HTMLLinkElement>(`link[data-ui-font='${selection}']`);
    if (existing) {
        loadedFonts.add(selection);
        return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.uiFont = selection;
    link.addEventListener('load', () => {
        loadedFonts.add(selection);
    });
    link.addEventListener('error', () => {
        loadedFonts.delete(selection);
        link.remove();
    });
    document.head.appendChild(link);
}
