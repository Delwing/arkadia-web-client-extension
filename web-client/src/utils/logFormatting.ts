export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da} ${formatTime(ts)}`;
}

export function splitLines(html: string): string[] {
  const lines: string[] = [];
  const stack: { open: string; close: string }[] = [];
  let line = "";
  const regex = /(<[^>]+>|\r?\n)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const token = match[0];
    line += html.slice(last, match.index);
    if (token === "\n" || token === "\r\n") {
      lines.push(line + stack.map(s => s.close).reverse().join(""));
      line = stack.map(s => s.open).join("");
    } else {
      line += token;
      if (token.startsWith("<") && !token.startsWith("</") && !token.endsWith("/>") && !token.startsWith("<!")) {
        const tag = token.match(/^<([a-zA-Z0-9:-]+)/);
        if (tag) stack.push({ open: token, close: `</${tag[1]}>` });
      } else if (token.startsWith("</")) {
        stack.pop();
      }
    }
    last = regex.lastIndex;
  }
  line += html.slice(last);
  lines.push(line);
  return lines;
}
