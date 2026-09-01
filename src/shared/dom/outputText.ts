import { AnsiAwareBuffer } from "@client/ansi/FormatState";

/**
 * Plain-text helpers for renderers that show game output as text rather than
 * as the ANSI-styled DOM `AnsiAwareBuffer.toDom()` produces.
 *
 * Lives in `@shared` because more than one such renderer exists now (forge's
 * `GameLog`, the boss key overlay's fake document) and the decoding rule below
 * is subtle enough that a second copy would eventually drift.
 */

/** The message text with formatting dropped. */
export const plainTextOf = (message: string | AnsiAwareBuffer): string =>
    message instanceof AnsiAwareBuffer ? message.text : message;

/**
 * Undo the HTML encoding the client applies to string output.
 *
 * `resolveObjectIds` and `echoCommand` emit `&lt;desc&gt;` for the stock UI's
 * `innerHTML` renderer. Anything rendering via `textContent` (or React, which
 * escapes for you) has to decode those back to literal characters first.
 *
 * `&amp;` is decoded LAST so an escaped entity like `&amp;lt;` survives as the
 * literal text `&lt;` rather than collapsing all the way to `<`.
 */
export const decodeOutputEntities = (text: string): string =>
    text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");

/** Plain, entity-decoded text for a message of either shape. */
export const readableTextOf = (message: string | AnsiAwareBuffer): string =>
    message instanceof AnsiAwareBuffer ? message.text : decodeOutputEntities(message);
