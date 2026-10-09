import { foldText } from "@shared/foldText.ts";

/** One hit in the game output: its range, and the line it sits on (for keeping the place). */
export interface OutputMatch {
    range: Range;
    line: Element;
    /** Offset of the hit in the line's text. */
    start: number;
}

/** The timestamp and message-type columns are chrome, not game text. */
const CHROME_SELECTOR = ".output-timestamp, .output-message-type";

/**
 * Every place `query` occurs in the output, top to bottom. The output's lines
 * are the wrapper's children (minus `skip`: the split view, the notification
 * overlay); a hit may run across the coloured spans of one line but never
 * across lines. Case and Polish letters don't matter, as in the other searches.
 */
export function findInOutput(wrapper: HTMLElement, query: string, skip: ReadonlySet<Element>): OutputMatch[] {
    const needle = foldText(query.trim());
    if (!needle) return [];
    const doc = wrapper.ownerDocument;
    const matches: OutputMatch[] = [];
    for (const line of Array.from(wrapper.children)) {
        if (skip.has(line)) continue;
        const nodes: Text[] = [];
        const starts: number[] = [];
        let text = "";
        const walker = doc.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            if (node.parentElement?.closest(CHROME_SELECTOR)) continue;
            nodes.push(node);
            starts.push(text.length);
            text += node.data;
        }
        if (text.length < needle.length) continue;
        const folded = foldText(text);
        let node = 0;
        for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + needle.length)) {
            // Hits come in order, so the node walk only ever moves forward.
            while (node + 1 < nodes.length && starts[node + 1] <= at) node++;
            let endNode = node;
            const end = at + needle.length;
            while (endNode + 1 < nodes.length && starts[endNode + 1] < end) endNode++;
            const range = doc.createRange();
            range.setStart(nodes[node], at - starts[node]);
            range.setEnd(nodes[endNode], end - starts[endNode]);
            matches.push({ range, line, start: at });
        }
    }
    return matches;
}

interface HighlightRegistry {
    set(name: string, highlight: unknown): void;
    delete(name: string): void;
}

function highlightApi(): { registry: HighlightRegistry; Highlight: new (...ranges: Range[]) => unknown } | null {
    const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
    const Highlight = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!css?.highlights || !Highlight) return null;
    return { registry: css.highlights, Highlight };
}

/** The `::highlight()` names painted: every hit, and the current one. */
export interface HighlightNames {
    all: string;
    current: string;
}

const OUTPUT_NAMES: HighlightNames = { all: "output-search", current: "output-search-current" };

/**
 * Paint the hits with the CSS Custom Highlight API: nothing is inserted into the
 * output, so the game text, its listeners and the trimming stay as they are.
 */
export function paintMatches(matches: readonly OutputMatch[], current: number, names = OUTPUT_NAMES): void {
    const api = highlightApi();
    if (!api) return;
    api.registry.set(names.all, new api.Highlight(...matches.map(m => m.range)));
    const hit = matches[current];
    if (hit) api.registry.set(names.current, new api.Highlight(hit.range));
    else api.registry.delete(names.current);
}

export function clearMatches(names = OUTPUT_NAMES): void {
    const api = highlightApi();
    api?.registry.delete(names.all);
    api?.registry.delete(names.current);
}

/**
 * Scroll the output so the hit is in view, unless it already is. It goes a third
 * of the way down: scrolled up, the output opens its split view, whose live
 * pane covers the bottom.
 */
export function revealMatch(wrapper: HTMLElement, match: OutputMatch, coveredBottom: number): void {
    const box = wrapper.getBoundingClientRect();
    const hit = match.range.getBoundingClientRect();
    const margin = 24;
    const visibleBottom = box.bottom - coveredBottom;
    if (hit.top >= box.top + margin && hit.bottom <= visibleBottom - margin) return;
    wrapper.scrollTop += hit.top - box.top - wrapper.clientHeight / 3;
}
