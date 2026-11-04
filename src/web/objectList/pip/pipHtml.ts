// Markup of the Picture-in-Picture window: a status header (location, cover
// timer), the list itself and a footer with the game's last output lines.

export interface PipHtmlParts {
    locationText: string;
    coverTimerText: string;
    bodyLines: string[];
    lastOutputHtml: string;
}

export function buildPipHtml({locationText, coverTimerText, bodyLines, lastOutputHtml}: PipHtmlParts): string {
    const header = buildPipHeaderHtml(locationText, coverTimerText);
    const footer = buildPipFooterHtml(lastOutputHtml);
    const body = `<div class="objects-list-pip-body">${bodyLines.join("<br>")}</div>`;
    const parts = [] as string[];
    if (header) {
        parts.push(header);
    }
    parts.push(body);
    if (footer) {
        parts.push(footer);
    }
    return parts.join("");
}

function buildPipHeaderHtml(locationText: string, coverTimerText: string) {
    const parts = [] as string[];
    if (locationText) {
        parts.push(escapeHtml(locationText));
    }
    if (coverTimerText) {
        parts.push(escapeHtml(coverTimerText));
    }
    if (!parts.length) {
        return "";
    }
    const content = parts.join("&nbsp;&bull;&nbsp;");
    return `<div class="objects-list-pip-header">${content}</div>`;
}

function buildPipFooterHtml(lastOutputHtml: string) {
    if (!lastOutputHtml) {
        return "";
    }
    return `<div class="objects-list-pip-footer"><div class="objects-list-pip-footer-content">${lastOutputHtml}</div></div>`;
}

/**
 * Splits an output message's HTML at its line breaks (`<br>` or newline),
 * closing the tags still open at each break and reopening them on the next
 * line, and drops lines with nothing visible.
 */
export function splitOutputHtmlIntoLines(html: string): string[] {
    const lines: string[] = [];
    const stack: { open: string; close: string }[] = [];
    let line = "";
    const regex = /(<[^>]+>|\r?\n)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    const hasVisibleContent = (value: string) =>
        value
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/gi, " ")
            .trim().length > 0;
    while ((match = regex.exec(html)) !== null) {
        const token = match[0];
        line += html.slice(last, match.index);
        if (token === "\n" || token === "\r\n" || /^<br\b[^>]*>$/i.test(token)) {
            const closedLine = line + stack.map(s => s.close).reverse().join("");
            if (hasVisibleContent(closedLine)) {
                lines.push(closedLine);
            }
            line = stack.map(s => s.open).join("");
        } else {
            line += token;
            if (token.startsWith("<") && !token.startsWith("</") && !token.endsWith("/>") && !token.startsWith("<!")) {
                const tag = token.match(/^<([a-zA-Z0-9:-]+)/);
                if (tag) {
                    stack.push({ open: token, close: `</${tag[1]}>` });
                }
            } else if (token.startsWith("</")) {
                stack.pop();
            }
        }
        last = regex.lastIndex;
    }
    line += html.slice(last);
    if (hasVisibleContent(line)) {
        lines.push(line);
    }
    return lines;
}

function escapeHtml(text: string) {
    const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    };
    return text.replace(/[&<>"']/g, (char) => map[char] || char);
}
