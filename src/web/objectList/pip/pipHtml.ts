// Splitting the game's output HTML into lines, for the Picture-in-Picture
// window's footer.

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
