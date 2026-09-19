/**
 * Builds a standalone HTML document from log lines.
 *
 * Self-contained by design: the in-client browser's export scrapes the live
 * page's stylesheets with `collectLogStyles()`, which ties the file to whatever
 * CSS happened to be loaded. Here the colours travel with the content — the
 * stored line HTML already carries the game's own inline colours, and the few
 * surrounding values are written into a small `<style>` block — so the saved
 * file looks the same on a machine that has never run the client.
 */
import type { RenderedRow } from "../model/viewerState";
import { formatClock } from "../model/format";
import { CHANNEL_META } from "../model/channels";

export interface HtmlExportOptions {
    title: string;
    /** Subtitle line: date, duration, line count, range if one is set. */
    meta: string;
    showTimestamps: boolean;
    showMeta: boolean;
    /** Use each line's stored HTML (the game's colours) rather than plain text. */
    showColors: boolean;
    /** Resolved CSS colours, so the file does not depend on our token layer. */
    palette: HtmlPalette;
}

export interface HtmlPalette {
    background: string;
    text: string;
    secondary: string;
    faint: string;
    border: string;
    accent: string;
}

const ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};

export function escapeHtml(value: string): string {
    return value.replace(/[&<>"]/g, (character) => ESCAPES[character]);
}

/**
 * The line's body. Stored HTML is emitted as-is — it is the client's own
 * rendering of a line it received, already sanitised on the way in, and it is
 * what carries the colours. Plain text is escaped.
 */
function renderBody(row: RenderedRow, showColors: boolean): string {
    if (showColors && row.html) return row.html;
    return escapeHtml(row.text);
}

export function buildLogHtml(rows: RenderedRow[], options: HtmlExportOptions): string {
    const { palette } = options;

    const lines = rows
        .map((row) => {
            const cells: string[] = [];
            if (options.showTimestamps) {
                cells.push(`<span class="t">${escapeHtml(formatClock(row.timestamp))}</span>`);
            }
            if (options.showMeta) {
                cells.push(`<span class="n">${row.number}</span>`);
                cells.push(`<span class="g">${escapeHtml(CHANNEL_META[row.channel].tag)}</span>`);
            }
            cells.push(`<span class="x">${renderBody(row, options.showColors)}</span>`);
            return `<div class="l">${cells.join("")}</div>`;
        })
        .join("\n");

    const columns = [
        options.showTimestamps ? "5.5em" : null,
        options.showMeta ? "3.5em" : null,
        options.showMeta ? "4em" : null,
        "minmax(0, 1fr)",
    ]
        .filter(Boolean)
        .join(" ");

    return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(options.title)}</title>
<style>
  body {
    margin: 0;
    padding: 24px;
    background: ${palette.background};
    color: ${palette.text};
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 13px;
    line-height: 21px;
  }
  header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid ${palette.border}; }
  h1 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
  .meta { color: ${palette.secondary}; font-size: 12px; }
  .l { display: grid; grid-template-columns: ${columns}; column-gap: 12px; }
  .t { color: ${palette.faint}; font-variant-numeric: tabular-nums; }
  .n { color: ${palette.faint}; text-align: right; font-variant-numeric: tabular-nums; }
  .g { color: ${palette.secondary}; font-size: 10.5px; letter-spacing: 0.06em; }
  .x { white-space: pre-wrap; min-width: 0; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(options.title)}</h1>
  <div class="meta">${escapeHtml(options.meta)}</div>
</header>
${lines}
</body>
</html>
`;
}
