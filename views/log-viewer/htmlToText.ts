/**
 * Stored log HTML to plain text, without a DOM: shared by the viewer and the
 * export worker (which has no document).
 */
const NAMED_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

const htmlStripper = typeof document === "undefined" ? null : document.createElement("template");

/**
 * The text of one stored line. The logger writes plain spans and entities, so
 * tags are dropped and entities decoded with string work: this runs for every
 * line of every log, and parsing each one as DOM was most of the load time.
 * An entity outside the common few goes through an inert \`<template>\`.
 */
export function htmlToText(html: string): string {
    if (html.indexOf("<") === -1 && html.indexOf("&") === -1) return html;
    const stripped = html.replace(/<[^>]*>/g, "");
    if (stripped.indexOf("&") === -1) return stripped;
    return stripped.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (entity, body: string) => {
        if (body[0] === "#") {
            const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
        }
        const known = NAMED_ENTITIES[body];
        if (known !== undefined) return known;
        if (!htmlStripper) return entity;
        htmlStripper.innerHTML = entity;
        return htmlStripper.content.textContent ?? entity;
    });
}
