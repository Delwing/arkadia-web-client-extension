import {outputLinesFromEnd} from "@shared/dom/outputMessageHandler.ts";

const MAX_OUTPUT_LINES = 500;
const MIN_WORD_LENGTH = 2;
/** Per-line metadata spans: in the DOM even while hidden, but not game text. */
const CHROME_SELECTOR = '.output-timestamp, .output-message-type';

function lineText(line: Element): string {
    if (!line.querySelector(CHROME_SELECTOR)) return line.textContent ?? '';
    const walker = line.ownerDocument.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let text = '';
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest(CHROME_SELECTOR)) continue;
        text += (node as Text).data;
    }
    return text;
}

/**
 * The text of the last {@link MAX_OUTPUT_LINES} line elements of an output
 * surface, oldest-first, without the timestamp / message-type spans. Callers needing their own tokenisation start here —
 * voice dictation folds diacritics before splitting, which `\w` cannot do.
 */
export function harvestOutputLines(wrapper: HTMLElement | null | undefined): string[] {
    if (!wrapper) return [];
    const lines: string[] = [];
    // From the newest back, as far as needed: the stock output keeps its lines
    // in blocks, so the wrapper's children are not the lines.
    for (const line of outputLinesFromEnd(wrapper)) {
        if (lines.length >= MAX_OUTPUT_LINES) break;
        lines.push(lineText(line));
    }

    return lines.reverse();
}

/**
 * Harvest completion candidate words from an output surface: the text of the
 * last {@link MAX_OUTPUT_LINES} line elements, split into words of at least
 * {@link MIN_WORD_LENGTH} characters, oldest-first. Shared by every UI's Tab
 * completion so the scan lives in one place.
 */
export function harvestOutputWords(wrapper: HTMLElement | null | undefined): string[] {
    const words: string[] = [];

    for (const text of harvestOutputLines(wrapper)) {
        const lineWords = text.match(/\w+/g);
        if (lineWords) {
            for (const w of lineWords) {
                if (w.length >= MIN_WORD_LENGTH) {
                    words.push(w);
                }
            }
        }
    }

    return words;
}
