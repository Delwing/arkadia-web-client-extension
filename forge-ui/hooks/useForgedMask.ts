import { useEffect, type RefObject } from 'react';

/**
 * Geometry for the forged password mask — the row of dots painted on top of a
 * real <input type="password"> so each character can cool from white-hot into
 * its bullet as you type it.
 *
 * The input itself is left completely intact: same element, same name, same
 * autocomplete, same value. It only loses its ink (`color: transparent`), so
 * password managers, autofill, paste, selection, undo and the caret all remain
 * the browser's job. The overlay is deliberately ignorant — it is driven by
 * value.LENGTH and renders the same character every time, so it cannot leak or
 * even spell what was typed.
 *
 * What lives here is the part that must not be guessed: the overlay has to sit
 * on the input's text box to the pixel, and several of those numbers belong to
 * the user agent (Chrome's own 1px/2px input padding, the resolved font after
 * a webfont swap). So they are COPIED off the live input rather than restated
 * in CSS, where they would rot the first time anything around them changed.
 */

// Everything that decides where a glyph lands. Colour is deliberately absent —
// the mask has its own, and copying it would undo the whole effect.
const MIRROR = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textIndent',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
] as const;

export default function useForgedMask(
    inputRef: RefObject<HTMLInputElement | null>,
    maskRef: RefObject<HTMLSpanElement | null>,
    active: boolean,
    length: number,
) {
    // Geometry only moves when the box does — never per keystroke, because
    // offsetLeft forces layout and typing is the one moment that must be free.
    useEffect(() => {
        const input = inputRef.current;
        const mask = maskRef.current;
        if (!active || !input || !mask) return;

        const place = () => {
            const cs = getComputedStyle(input);
            for (const prop of MIRROR) mask.style[prop] = cs[prop];
            // offsetParent is .gate__rule (already position:relative), so these
            // are exactly the input's own box — no arithmetic on the prompt
            // width or the flex gap, either of which could change under us.
            mask.style.left = `${input.offsetLeft}px`;
            mask.style.top = `${input.offsetTop}px`;
            mask.style.width = `${input.offsetWidth}px`;
            mask.style.height = `${input.offsetHeight}px`;
        };

        // The input scrolls once the dots outrun the field; follow it or the
        // caret walks off the end of our row.
        const follow = () => {
            mask.scrollLeft = input.scrollLeft;
        };

        place();
        const observer = new ResizeObserver(place);
        observer.observe(input);
        input.addEventListener('scroll', follow);
        // A webfont landing after first paint moves every advance on the line.
        document.fonts?.ready.then(place);

        return () => {
            observer.disconnect();
            input.removeEventListener('scroll', follow);
        };
    }, [inputRef, maskRef, active]);

    // Re-sync after the row grows or shrinks: the input may have scrolled in
    // the same commit that added the glyph, and that happens after layout.
    useEffect(() => {
        const input = inputRef.current;
        const mask = maskRef.current;
        if (!active || !input || !mask) return;
        mask.scrollLeft = input.scrollLeft;
    }, [inputRef, maskRef, active, length]);
}
