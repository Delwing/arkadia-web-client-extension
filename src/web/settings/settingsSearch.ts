/**
 * Search over the rendered settings pages.
 *
 * Like mudix, the index is the DOM itself: every page stays mounted, so a
 * section's searchable text is simply its rendered text (labels, help text,
 * option names). Conditionally rendered rows become searchable for free and
 * there is no second list of labels to keep in step with the JSX.
 */

import { SETTINGS_VALUE_ATTR } from "./SettingsValue";

const HIGHLIGHT_NAME = "settings-search";
const MISS_ATTR = "data-settings-search-miss";

/**
 * Lower-cases and strips diacritics one UTF-16 unit at a time, so the result
 * has the same length as the input and match offsets map straight back onto
 * the original text (needed for highlight ranges).
 */
export function foldText(text: string): string {
    let out = "";
    for (let i = 0; i < text.length; i++) {
        const lower = text[i].toLowerCase();
        // l-stroke has no canonical decomposition, so NFD leaves it alone.
        if (lower === "ł") {
            out += "l";
            continue;
        }
        out += lower.normalize("NFD")[0] ?? text[i];
    }
    return out;
}

export function searchTerms(query: string): string[] {
    return foldText(query).split(/\s+/).filter(Boolean);
}

export function matchesAllTerms(foldedText: string, terms: readonly string[]): boolean {
    return terms.every(term => foldedText.includes(term));
}

/** Sections directly on a page, ignoring any section nested inside another. */
function topLevelSections(page: HTMLElement): HTMLElement[] {
    return Array.from(page.querySelectorAll<HTMLElement>("section")).filter(
        section => !section.parentElement?.closest("section"),
    );
}

/**
 * A section's text with a space at every text-node boundary. Plain
 * `textContent` glues neighbouring elements together ("KolorZT" + "Ładowanie"),
 * which lets a term match across two unrelated labels.
 */
function sectionText(section: HTMLElement): string {
    const parts: string[] = [];
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeValue && !isStoredValue(node)) parts.push(node.nodeValue);
    }
    return parts.join(" ");
}

/** A serialized editor value (see SettingsValue), not text the user reads. */
function isStoredValue(node: Node): boolean {
    return !!node.parentElement?.closest(`[${SETTINGS_VALUE_ATTR}]`);
}

export interface PageSearchInput {
    element: HTMLElement;
    /** Text that matches the whole page (group + category label + keywords). */
    pageText: string;
}

/**
 * Marks non-matching sections on each page and returns the indexes of pages
 * with at least one match. A term may be satisfied by the page text, so
 * "mapa kolor" finds colour rows on the Mapa page.
 */
export function applySearch(pages: readonly PageSearchInput[], terms: readonly string[]): Set<number> {
    const hits = new Set<number>();
    pages.forEach(({ element, pageText }, index) => {
        const foldedPage = foldText(pageText);
        for (const section of topLevelSections(element)) {
            const hit = matchesAllTerms(`${foldedPage} ${foldText(sectionText(section))}`, terms);
            section.toggleAttribute(MISS_ATTR, !hit);
            if (hit) hits.add(index);
        }
    });
    return hits;
}

export function clearSearch(pages: readonly PageSearchInput[]): void {
    for (const { element } of pages) {
        element.querySelectorAll(`[${MISS_ATTR}]`).forEach(el => el.removeAttribute(MISS_ATTR));
    }
    clearHighlights();
}

interface HighlightRegistry {
    set(name: string, highlight: unknown): void;
    delete(name: string): void;
}

function highlightRegistry(): { registry: HighlightRegistry; Highlight: new (...ranges: Range[]) => unknown } | null {
    const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
    const Highlight = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!css?.highlights || !Highlight) return null;
    return { registry: css.highlights, Highlight };
}

/**
 * Paints matched words with the CSS Custom Highlight API, which marks text
 * ranges without touching the DOM React owns. Browsers without it simply show
 * the filtered sections unhighlighted.
 */
export function highlightTerms(pages: readonly PageSearchInput[], terms: readonly string[]): void {
    const api = highlightRegistry();
    if (!api) return;
    const ranges: Range[] = [];
    for (const { element } of pages) {
        for (const section of topLevelSections(element)) {
            if (section.hasAttribute(MISS_ATTR)) continue;
            const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (node.parentElement?.closest("option, script, style") || isStoredValue(node)) continue;
                const folded = foldText(node.nodeValue ?? "");
                for (const term of terms) {
                    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
                        const range = document.createRange();
                        range.setStart(node, at);
                        range.setEnd(node, at + term.length);
                        ranges.push(range);
                    }
                }
            }
        }
    }
    api.registry.set(HIGHLIGHT_NAME, new api.Highlight(...ranges));
}

export function clearHighlights(): void {
    highlightRegistry()?.registry.delete(HIGHLIGHT_NAME);
}
