import type { UiFontSelection } from '@shared/uiSettingsTypes.ts';
import { UPLOADED_FONT_FACE_FAMILY } from './fonts/uploadedFont';

export type { UiFontSelection };

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
        || value === 'custom'
        || value === 'system'
        || value === 'uploaded';
}

export function ensureFontLoaded(selection: UiFontSelection, customHref?: string) {
    if (typeof document === 'undefined') {
        return;
    }
    // Installed fonts need nothing; uploaded faces are published by fonts/uploadedFont.
    if (selection === 'default' || selection === 'system' || selection === 'uploaded') {
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

function quoteFamily(name: string): string {
    return /['",]/.test(name) ? name : `"${name}"`;
}

/** The typed-in family name behind a selection: link, installed or uploaded. */
export function selectedFontName(settings: {
    fontFamily: UiFontSelection;
    customFontFamily?: string;
    systemFontFamily?: string;
    uploadedFontFamily?: string;
}): string {
    switch (settings.fontFamily) {
    case 'custom':
        return settings.customFontFamily ?? '';
    case 'system':
        return settings.systemFontFamily ?? '';
    case 'uploaded':
        return settings.uploadedFontFamily ?? '';
    default:
        return '';
    }
}

/**
 * CSS font-family stack for a font selection, or undefined for the system
 * default. `familyName` is the name that goes with 'custom', 'system' or
 * 'uploaded' (see selectedFontName).
 */
export function resolveOutputFontFamily(selection: UiFontSelection, familyName: string): string | undefined {
    switch (selection) {
    case 'uploaded': {
        // The uploaded faces first; on a device without the files, an
        // installed copy of the same family, then the default.
        const trimmed = familyName.trim();
        const fallback = trimmed && !/['",]/.test(trimmed) ? `, "${trimmed}"` : '';
        return `"${UPLOADED_FONT_FACE_FAMILY}"${fallback}, monospace`;
    }
    case 'fira-code':
        return '"Fira Code", monospace';
    case 'jetbrains-mono':
        return '"JetBrains Mono", monospace';
    case 'cascadia-mono':
        return '"Cascadia Mono", monospace';
    case 'vera-sans-mono':
        return '"Bitstream Vera Sans Mono", monospace';
    case 'system':
    case 'custom': {
        const trimmed = familyName.trim();
        if (!trimmed) {
            return undefined;
        }
        return `${quoteFamily(trimmed)}, monospace`;
    }
    default:
        return undefined;
    }
}
