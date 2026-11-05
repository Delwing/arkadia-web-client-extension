import {colorToHex} from "./colors";
import {isDefaultState} from "./formatSnapshot";
import type {BufferSegment, FormatHyperlink} from "./formatSnapshot";

/**
 * Converts the buffer to HTML with styling based on format states.
 * Note: Hyperlinks with callbacks cannot be properly rendered in HTML strings.
 * Use toDom() instead if you need clickable links - or pass `linkId`, which
 * names a link (`data-link="<id>"`) so whoever shows the HTML can ask for
 * its click to be run here.
 */
export function segmentsToHtml(segments: BufferSegment[], linkId?: (link: FormatHyperlink) => string | null): string {
    let html = "";

    for (const segment of segments) {
        const escapedText = escapeHtml(segment.text);

        if (!segment.state || isDefaultState(segment.state)) {
            html += escapedText;
            continue;
        }

        const styles: string[] = [];
        const state = segment.state;
        const classAttr = state.cssClass ? ` class="${escapeHtml(state.cssClass)}"` : "";

        // Handle inverse first (swaps foreground and background)
        const fg = state.inverse ? state.background : state.foreground;
        const bg = state.inverse ? state.foreground : state.background;

        // Foreground color
        if (fg) {
            styles.push(`color: ${colorToHex(fg)}`);
        }

        // Background color
        if (bg) {
            styles.push(`background-color: ${colorToHex(bg)}`);
        }

        // Font styles
        if (state.bold) {
            styles.push("font-weight: bold");
        }

        if (state.italic) {
            styles.push("font-style: italic");
        }

        // Text decorations
        const decorations: string[] = [];
        if (state.underline) {
            decorations.push("underline");
        }
        if (state.strikethrough) {
            decorations.push("line-through");
        }
        if (decorations.length > 0) {
            styles.push(`text-decoration: ${decorations.join(" ")}`);
        }

        // Handle hyperlinks
        if (state.hyperlink) {
            styles.push("cursor: pointer");
            styles.push("text-decoration: underline");
            styles.push("text-decoration-style: dotted");
            styles.push("text-decoration-skip-ink: auto");
            const id = linkId?.(state.hyperlink);
            const dataAttr = ' data-output-clickable="true"' + (id ? ` data-link="${escapeHtml(id)}"` : '');
            if (state.hyperlink.title) {
                const titleAttr = ` title="${escapeHtml(state.hyperlink.title)}"`;
                const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
                html += `<span${styleAttr}${classAttr}${titleAttr}${dataAttr}>${escapedText}</span>`;
                continue;
            }
            const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
            html += `<span${styleAttr}${classAttr}${dataAttr}>${escapedText}</span>`;
            continue;
        }

        const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
        html += `<span${styleAttr}${classAttr}>${escapedText}</span>`;
    }

    return html;
}

/**
 * Converts the buffer to a DOM DocumentFragment with actual event listeners attached.
 * This should be used instead of toHtml() when you need clickable links.
 */
export function segmentsToDom(segments: BufferSegment[]): DocumentFragment {
    const fragment = document.createDocumentFragment();

    for (const segment of segments) {
        const state = segment.state;

        if (!state || isDefaultState(state)) {
            fragment.appendChild(document.createTextNode(segment.text));
            continue;
        }

        const element = document.createElement('span');
        element.textContent = segment.text;

        const styles: string[] = [];

        // Handle inverse first (swaps foreground and background)
        const fg = state.inverse ? state.background : state.foreground;
        const bg = state.inverse ? state.foreground : state.background;

        // Foreground color
        if (fg) {
            styles.push(`color: ${colorToHex(fg)}`);
        }

        // Background color
        if (bg) {
            styles.push(`background-color: ${colorToHex(bg)}`);
        }

        // Font styles
        if (state.bold) {
            styles.push("font-weight: bold");
        }

        if (state.italic) {
            styles.push("font-style: italic");
        }

        // Text decorations
        const decorations: string[] = [];
        if (state.underline) {
            decorations.push("underline");
        }
        if (state.strikethrough) {
            decorations.push("line-through");
        }
        if (decorations.length > 0) {
            styles.push(`text-decoration: ${decorations.join(" ")}`);
        }

        // Handle hyperlinks
        if (state.hyperlink) {
            styles.push("cursor: pointer");
            styles.push("text-decoration: underline");
            styles.push("text-decoration-style: dotted");
            styles.push("text-decoration-skip-ink: auto");

            // Mark as clickable to prevent input focus
            element.dataset.outputClickable = "true";

            if (state.hyperlink.title) {
                element.title = state.hyperlink.title;
            }

            if (state.hyperlink.onClick) {
                element.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    state.hyperlink!.onClick!(e);
                });
            }

            if (state.hyperlink.onContextMenu) {
                element.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    state.hyperlink!.onContextMenu!(e);
                });
            }

            if (state.hyperlink.onMouseEnter) {
                element.addEventListener('mouseenter', (e) => {
                    state.hyperlink!.onMouseEnter!(e);
                });
            }

            if (state.hyperlink.onMouseLeave) {
                element.addEventListener('mouseleave', (e) => {
                    state.hyperlink!.onMouseLeave!(e);
                });
            }
        }

        // Apply dim effect CSS custom properties
        if (state.dim) {
            styles.push(`--dim-start: ${state.dim.startOpacity}`);
            styles.push(`--dim-end: ${state.dim.endOpacity}`);
            styles.push(`--dim-duration: ${state.dim.duration}ms`);
            styles.push(`--dim-easing: ${state.dim.easing || 'ease-in-out'}`);
        }

        if (styles.length > 0) {
            element.style.cssText = styles.join("; ");
        }

        // Apply blink, dim, and custom CSS classes
        const classes: string[] = [];
        if (state.cssClass) {
            classes.push(state.cssClass);
        }
        if (state.slowBlink) {
            classes.push('ansi-slow-blink');
        }
        if (state.rapidBlink) {
            classes.push('ansi-rapid-blink');
        }
        if (state.dim) {
            classes.push('ansi-dim');
        }
        if (classes.length > 0) {
            element.className = classes.join(' ');
        }

        fragment.appendChild(element);
    }

    return fragment;
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
