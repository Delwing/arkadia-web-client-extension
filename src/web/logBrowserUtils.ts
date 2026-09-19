/**
 * What is left of the old log browser's helpers.
 *
 * The browser itself is now `@ui/logViewer`, which brings its own model; these
 * are the pieces around it that still have callers: reading raw records out of
 * a session store (`log-viewer/sessionAdapter.ts`, `LogManager`), splitting a
 * stored record into lines, and the file-name / style plumbing the ZIP export
 * and the to-disk saver share.
 */
export interface LogEntry {
  text: string;
  type?: string;
  timestamp: number;
}

function formatTime(ts: number): string {
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

export function formatSessionFileName(name: string): string {
  if (name.startsWith("session_")) {
    const ts = parseInt(name.slice("session_".length), 10);
    if (!Number.isNaN(ts)) {
      const d = new Date(ts);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      const s = String(d.getSeconds()).padStart(2, "0");
      return `${y}-${mo}-${da} - ${h}-${m}-${s}`;
    }
  }
  return name;
}

/** Collect only CSS rules relevant to log HTML output. */
export function collectLogStyles(): string {
  // Class names used in exported log HTML. Seeded rather than scraped, because
  // since the design-system migration no `#logs-preview` is ever mounted: the
  // log pane is `@ui/logViewer`'s and carries its own markup. The scrape below
  // is kept for anything else that puts one on the page.
  const usedClasses = new Set<string>([
    "output_msg",
    "output_msg_text",
    "log-time",
    "logs-preview-highlight",
    // ansi animation classes that may appear in log content
    "ansi-slow-blink",
    "ansi-rapid-blink",
    "ansi-dim",
  ]);

  // Augment with class names actually present in the live preview, if mounted.
  const logContainer = document.getElementById("logs-preview");
  if (logContainer) {
    for (const el of logContainer.querySelectorAll("[class]")) {
      for (const cls of el.classList) usedClasses.add(cls);
    }
  }

  function isRelevantRule(rule: CSSRule): boolean {
    if (rule instanceof CSSKeyframesRule) {
      const name = rule.name;
      return name.startsWith("ansi-");
    }
    if (rule instanceof CSSStyleRule) {
      const sel = rule.selectorText;
      // Match rules that reference #logs-preview or any used class
      if (sel.includes("#logs-preview")) return true;
      if (sel === ":root" || sel === "body" || sel === "html" || sel === "html, body") return true;
      for (const cls of usedClasses) {
        if (sel.includes(`.${cls}`)) return true;
      }
      return false;
    }
    if (rule instanceof CSSMediaRule) {
      const inner: string[] = [];
      for (const child of Array.from(rule.cssRules)) {
        if (isRelevantRule(child)) inner.push(child.cssText);
      }
      if (inner.length > 0) return true;
    }
    return false;
  }

  function extractRuleCss(rule: CSSRule): string {
    if (rule instanceof CSSMediaRule) {
      const inner: string[] = [];
      for (const child of Array.from(rule.cssRules)) {
        if (isRelevantRule(child)) inner.push(child.cssText);
      }
      if (inner.length > 0) {
        return `@media ${rule.conditionText} { ${inner.join("\n")} }`;
      }
      return "";
    }
    return rule.cssText;
  }

  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (isRelevantRule(rule)) {
          const css = extractRuleCss(rule);
          if (css) parts.push(css);
        }
      }
    } catch {
      // Skip cross-origin stylesheets
    }
  }
  return parts.join("\n");
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

export async function getRawSessionData(db: IDBDatabase, storeName: string): Promise<LogEntry[]> {
  return new Promise(resolve => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, "readonly");
    } catch (error) {
      console.error(`Failed to create transaction for ${storeName}:`, error);
      resolve([]);
      return;
    }
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as LogEntry[]);
    req.onerror = () => {
      console.error(`Failed to read from ${storeName}:`, req.error);
      resolve([]);
    };
  });
}
