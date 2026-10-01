import type { MatchSegment } from "../model/search";

/**
 * Puts the search marks into a line's stored HTML, so a hit keeps the game's
 * colours around it instead of the whole line dropping to plain text.
 *
 * The segments are offsets into the line's plain text, which is the HTML's
 * text content; each text node is split where a match starts or ends and the
 * matched part wrapped in a `<mark>`. A match that crosses a colour change
 * becomes several marks sharing one `data-occurrence`.
 *
 * Returns null when the HTML's text is not the line's text (nothing to anchor
 * the offsets to) — the caller then renders the plain segments.
 */
export function highlightHtml(html: string, segments: MatchSegment[], currentOccurrence: number): string | null {
    const template = document.createElement("template");
    template.innerHTML = html;
    const root = template.content;
    const text = segments.map((segment) => segment.text).join("");
    if (root.textContent !== text) return null;

    // [start, end, occurrence] in plain-text offsets.
    const ranges: [number, number, number][] = [];
    let offset = 0;
    let occurrence = 0;
    for (const segment of segments) {
        if (segment.match) ranges.push([offset, offset + segment.text.length, occurrence++]);
        offset += segment.text.length;
    }
    if (ranges.length === 0) return html;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);

    let nodeStart = 0;
    for (const node of nodes) {
        const value = node.data;
        const nodeEnd = nodeStart + value.length;
        const overlapping = ranges.filter(([start, end]) => start < nodeEnd && end > nodeStart);
        if (overlapping.length > 0) {
            const fragment = document.createDocumentFragment();
            let cursor = 0;
            for (const [start, end, index] of overlapping) {
                const from = Math.max(start - nodeStart, 0);
                const to = Math.min(end - nodeStart, value.length);
                if (from > cursor) fragment.append(value.slice(cursor, from));
                const mark = document.createElement("mark");
                mark.dataset.occurrence = String(index);
                mark.dataset.current = String(index === currentOccurrence);
                mark.textContent = value.slice(from, to);
                fragment.append(mark);
                cursor = to;
            }
            if (cursor < value.length) fragment.append(value.slice(cursor));
            node.replaceWith(fragment);
        }
        nodeStart = nodeEnd;
    }

    const holder = document.createElement("div");
    holder.append(root);
    return holder.innerHTML;
}
