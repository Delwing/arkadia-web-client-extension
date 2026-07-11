const MAX_OUTPUT_LINES = 500;
const MIN_WORD_LENGTH = 2;

/**
 * Harvest completion candidate words from an output surface: the text of the
 * last {@link MAX_OUTPUT_LINES} line elements, split into words of at least
 * {@link MIN_WORD_LENGTH} characters, oldest-first. Shared by every UI's Tab
 * completion so the scan lives in one place.
 */
export function harvestOutputWords(wrapper: HTMLElement | null | undefined): string[] {
    if (!wrapper) return [];
    const children = wrapper.children;
    const words: string[] = [];

    const startIdx = Math.max(0, children.length - MAX_OUTPUT_LINES);
    for (let i = startIdx; i < children.length; i++) {
        const text = children[i].textContent ?? '';
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
