import type Client from '@client/Client';
import { globalStorage } from '@modules/core/storage';

const OUTPUT_ID = 'main_text_output_msg_wrapper';
const MEASURE_ID = 'content-width-measure';

/**
 * Compute how many monospace columns fit in `content`, using the single
 * character rendered in `measure` (a hidden element whose font is synced to the
 * output's) to derive character width. Returns null if it cannot be measured
 * yet (zero width).
 */
export function measureContentColumns(content: HTMLElement, measure: HTMLElement): number | null {
    const style = window.getComputedStyle(content);
    measure.style.fontFamily = style.fontFamily;
    measure.style.fontSize = style.fontSize;
    const charWidth = measure.getBoundingClientRect().width;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const width = content.clientWidth - paddingLeft - paddingRight;
    if (charWidth > 0 && width > 0) {
        return Math.floor(width / charWidth);
    }
    return null;
}

/**
 * Measure the terminal's column width from the DOM and push it into the client
 * via `client.setContentWidth()`, keeping it current on resize and font-size
 * changes.
 *
 * This owns the DOM/`ResizeObserver`/`window.resize` wiring that used to live in
 * `Client`'s constructor, so the client core stays DOM-free. An alternate UI
 * either reuses this (by providing elements with the same ids) or supplies its
 * own width source and calls `client.setContentWidth()` directly.
 */
export function installContentWidthMeasurer(client: Client): void {
    const update = () => {
        const content = document.getElementById(OUTPUT_ID) as HTMLElement | null;
        const measure = document.getElementById(MEASURE_ID) as HTMLElement | null;
        if (!content || !measure) return;
        const cols = measureContentColumns(content, measure);
        if (cols !== null) {
            client.setContentWidth(cols);
        }
    };

    update();

    const content = document.getElementById(OUTPUT_ID);
    if (content) {
        new ResizeObserver(update).observe(content);
    }
    window.addEventListener('resize', update);
    globalStorage.onChange('uiSettings', update);
}
