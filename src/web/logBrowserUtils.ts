export interface LogEntry {
  text: string;
  type?: string;
  timestamp: number;
}

export interface ParsedLogLine {
  html: string;
  text: string;
}

export interface ParsedLogGroup {
  timestamp: number;
  time: string;
  dateTime: string;
  type?: string;
  lines: ParsedLogLine[];
}

export interface FlatLogLine {
  groupIndex: number;
  lineIndex: number;
  time: string;
  html: string;
  text: string;
  type?: string;
  timestamp: number;
}

export interface SessionInfo {
  name: string;
  label: string;
}

export interface LineMatch {
  flatIndex: number;
  matchIndex: number;
  text: string;
  lineText: string;
}

export interface SearchResult {
  sessionName: string;
  sessionLabel: string;
  groupTimestamp: number;
  groupDateTime: string;
  matches: LineMatch[];
}

export interface SearchSessionGroup {
  sessionName: string;
  sessionLabel: string;
  results: SearchResult[];
  totalMatches: number;
}

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

export function formatSessionLabel(name: string): string {
  if (name.startsWith("session_")) {
    const ts = parseInt(name.slice("session_".length), 10);
    if (!Number.isNaN(ts)) {
      const d = new Date(ts);
      const da = String(d.getDate()).padStart(2, "0");
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      const s = String(d.getSeconds()).padStart(2, "0");
      return `${da}.${mo} ${h}:${m}:${s}`;
    }
  }
  return name;
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

export function getSessionYear(name: string): number | null {
  if (name.startsWith("session_")) {
    const ts = parseInt(name.slice("session_".length), 10);
    if (!Number.isNaN(ts)) return new Date(ts).getFullYear();
  }
  return null;
}

/** Collect only CSS rules relevant to log HTML output. */
export function collectLogStyles(): string {
  // Class names used in exported log HTML. Seed these so style collection works
  // even when the live preview (#logs-preview) is not mounted - e.g. when
  // exporting from the "Zarzadzanie" tab, where #logs-preview does not exist.
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

export function normalizeFlags(flags: string): string {
  const filtered = flags.replace(/g/g, "");
  const parts = filtered.split("").filter(part => part !== "");
  return Array.from(new Set(parts)).join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseSearchQuery(query: string): { regex: RegExp | null; error?: string } {
  const trimmed = query.trim();
  if (!trimmed) {
    return { regex: null };
  }
  if (trimmed.startsWith("/")) {
    let escaped = false;
    for (let i = 1; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (!escaped && char === "/") {
        const pattern = trimmed.slice(1, i);
        const flags = trimmed.slice(i + 1);
        try {
          return { regex: new RegExp(pattern, flags) };
        } catch {
          return { regex: null, error: "Niepoprawne wyrazenie regularne." };
        }
      }
      escaped = !escaped && char === "\\";
    }
  }
  try {
    return { regex: new RegExp(escapeRegExp(trimmed), "i") };
  } catch {
    return { regex: null, error: "Nie udalo sie utworzyc wyrazenia wyszukiwania." };
  }
}

const textParser = document.createElement("div");

export function parseLogEntries(entries: LogEntry[]): ParsedLogGroup[] {
  const groups: ParsedLogGroup[] = [];
  for (const entry of entries) {
    const lines: ParsedLogLine[] = [];
    const parts = splitLines(entry.text);
    for (const part of parts) {
      textParser.innerHTML = part;
      const text = textParser.textContent ?? "";
      textParser.textContent = "";
      lines.push({ html: part, text });
    }
    groups.push({
      timestamp: entry.timestamp,
      time: formatTime(entry.timestamp),
      dateTime: formatDateTime(entry.timestamp),
      type: entry.type,
      lines,
    });
  }
  return groups;
}

export function flattenLogGroups(groups: ParsedLogGroup[]): FlatLogLine[] {
  const flat: FlatLogLine[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    for (let lineIndex = 0; lineIndex < group.lines.length; lineIndex++) {
      const line = group.lines[lineIndex];
      flat.push({
        groupIndex,
        lineIndex,
        time: group.time,
        html: line.html,
        text: line.text,
        type: group.type,
        timestamp: group.timestamp,
      });
    }
  }
  return flat;
}

export async function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open("ArkadiaMessagesDB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error("[Logs] Failed to open IndexedDB:", request.error);
        resolve(null);
      };
    } catch (error) {
      console.error("[Logs] Error opening IndexedDB:", error);
      resolve(null);
    }
  });
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

export async function getSessionData(db: IDBDatabase, storeName: string): Promise<ParsedLogGroup[]> {
  const logs = await getRawSessionData(db, storeName);
  return parseLogEntries(logs);
}
