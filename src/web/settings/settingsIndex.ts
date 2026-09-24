/**
 * The individual settings on a rendered page, for the phone's search: each
 * result is one setting (a switch, a select, a field), not a page.
 *
 * Like the page search, the index is the DOM: the pages are always mounted and
 * built from the same primitives, so a setting is a `label.popup-check` (a
 * checkbox) or a `.popup-field` with a label (anything else). There is no
 * second list of labels to keep in step with the JSX, and rows that appear
 * behind a checkbox become searchable as soon as they render.
 */

import { foldText, isStoredValue, matchesAllTerms, topLevelSections } from "./settingsSearch";

export type SettingControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface SettingEntry {
    /** Title of the card the setting sits in ("" when the page has none). */
    section: string;
    label: string;
    /** The row: what the page scrolls to. */
    element: HTMLElement;
    /** A checkbox flips in place; anything else opens its page. */
    kind: "toggle" | "value";
    /** The control behind it; for radios, the first of the group. */
    control: SettingControl | null;
    /** A select's (or choice list's) option texts, searched too ("Tryb zbierania" has "monety"). */
    options: string[];
}

const IGNORED = "[data-settings-ignore]";
const TITLE_SELECTOR = ":scope > h5, :scope > h6, :scope > .ui-settings-section-header > h6";

function text(node: Element | null | undefined): string {
    if (!node) return "";
    const parts: string[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!isStoredValue(n)) parts.push(n.nodeValue ?? "");
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
}

function sectionTitle(section: HTMLElement): string {
    return text(section.querySelector(TITLE_SELECTOR));
}

function skipped(el: Element): boolean {
    return !!el.closest(IGNORED) || !!el.closest("[data-settings-value]");
}

function entriesIn(root: HTMLElement, section: string): SettingEntry[] {
    const entries: SettingEntry[] = [];
    // Document order, so results read like the page.
    const rows = root.querySelectorAll<HTMLElement>("label.popup-check, .popup-field");
    for (const row of rows) {
        if (skipped(row)) continue;
        if (row.matches("label.popup-check")) {
            const input = row.querySelector<HTMLInputElement>(":scope > input");
            if (input?.type !== "checkbox") continue;
            const label = text(row.querySelector(":scope > span"));
            if (label) entries.push({ section, label, element: row, kind: "toggle", control: input, options: [] });
            continue;
        }
        const label = text(row.querySelector(":scope > .popup-field__label"));
        if (!label) continue;
        // A field that groups checkboxes ("Co zbierać") is its checkboxes.
        if (row.querySelector("input[type=checkbox]")) continue;
        const control = row.querySelector<SettingControl>(
            "select, textarea, input:not([type=checkbox]):not([type=button]):not([type=submit])",
        );
        if (!control) continue;
        const options = control instanceof HTMLSelectElement
            ? Array.from(control.options, option => option.textContent?.trim() ?? "").filter(Boolean)
            : Array.from(row.querySelectorAll(".popup-choices__label"), choice => text(choice)).filter(Boolean);
        entries.push({ section, label, element: row, kind: "value", control, options });
    }
    return entries;
}

/** Every setting on a page, card by card. */
export function indexPage(page: HTMLElement): SettingEntry[] {
    const sections = topLevelSections(page);
    if (sections.length === 0) return entriesIn(page, "");
    return sections.flatMap(section => entriesIn(section, sectionTitle(section)));
}

/** The cards on a page with their titles, for the section chips and the page summary. */
export function pageSections(page: HTMLElement): { element: HTMLElement; title: string }[] {
    return topLevelSections(page)
        .map(element => ({ element, title: sectionTitle(element) }))
        .filter(section => section.title);
}

/**
 * Whether a page belongs under "Strony" in the phone's results: by its own
 * text (name, group, keywords) or a card's title. Not by every word on it -
 * the settings the words belong to are listed above it already.
 */
export function pageMatches(page: HTMLElement, pageText: string, terms: readonly string[]): boolean {
    const foldedPage = foldText(pageText);
    if (matchesAllTerms(foldedPage, terms)) return true;
    return pageSections(page).some(section => matchesAllTerms(`${foldedPage} ${foldText(section.title)}`, terms));
}

/** What a value setting is set to, shown next to the result. */
export function settingPreview(entry: SettingEntry): string {
    const control = entry.control;
    if (!control) return "";
    if (control instanceof HTMLSelectElement) return control.selectedOptions[0]?.textContent?.trim() ?? "";
    if (control instanceof HTMLInputElement && control.type === "radio") {
        const checked = entry.element.querySelector<HTMLInputElement>("input[type=radio]:checked");
        const label = checked?.closest("label");
        return text(label?.querySelector(".popup-choices__label") ?? label);
    }
    return control.value.split("\n")[0];
}

export interface SettingMatch {
    entry: SettingEntry;
    /** Set when a term matched only an option of a select: that option. */
    viaOption?: string;
}

/**
 * The settings whose label (or, for a select, label plus options) holds every
 * term. Section and page names do not count: searching "walka" should list the
 * Walka page, not every setting on it.
 */
export function matchSettings(entries: readonly SettingEntry[], terms: readonly string[]): SettingMatch[] {
    const matches: SettingMatch[] = [];
    for (const entry of entries) {
        const label = foldText(entry.label);
        if (matchesAllTerms(label, terms)) {
            matches.push({ entry });
            continue;
        }
        if (entry.options.length === 0) continue;
        const withOptions = `${label} ${entry.options.map(foldText).join(" ")}`;
        if (!matchesAllTerms(withOptions, terms)) continue;
        const viaOption = entry.options.find(option => terms.some(term => !label.includes(term) && foldText(option).includes(term)));
        matches.push({ entry, viaOption });
    }
    return matches;
}

/** `text` cut into plain and matched runs, for highlighting the terms. */
export function highlightRuns(value: string, terms: readonly string[]): { text: string; hit: boolean }[] {
    const folded = foldText(value);
    const marked = new Array<boolean>(value.length).fill(false);
    for (const term of terms) {
        for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
            marked.fill(true, at, at + term.length);
        }
    }
    const runs: { text: string; hit: boolean }[] = [];
    for (let i = 0; i < value.length; i++) {
        const last = runs[runs.length - 1];
        if (last && last.hit === marked[i]) last.text += value[i];
        else runs.push({ text: value[i], hit: marked[i] });
    }
    return runs;
}

/** Polish count forms: 1 → one, 2-4 (not 12-14) → few, else many. */
function plural(count: number, one: string, few: string, many: string): string {
    const tens = count % 100;
    const ones = count % 10;
    if (count === 1) return `1 ${one}`;
    if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${count} ${few}`;
    return `${count} ${many}`;
}

/** 1 zmiana, 2 zmiany, 5 zmian (and 12 zmian, 22 zmiany). */
export function unsavedChangesText(count: number): string {
    return plural(count, "niezapisana zmiana", "niezapisane zmiany", "niezapisanych zmian");
}

export function settingsCountText(count: number): string {
    return plural(count, "ustawienie", "ustawienia", "ustawień");
}
