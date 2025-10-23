import Modal from "bootstrap/js/dist/modal";
import storage from "@client/src/storage";

interface LogEntry {
  text: string;
  type?: string;
  timestamp: number;
}

let initialized = false;

function initLogBrowser(): boolean {
  if (initialized) return true;
  const button = document.getElementById("logs-button") as HTMLButtonElement | null;
  const modalEl = document.getElementById("logs-modal") as HTMLElement | null;
  const select = document.getElementById("logs-session-select") as HTMLSelectElement | null;
  const preview = document.getElementById("logs-preview") as HTMLElement | null;
  const download = document.getElementById("logs-download") as HTMLButtonElement | null;
  const enabled = document.getElementById("logs-enabled") as HTMLInputElement | null;
  const searchInput = document.getElementById("logs-search-input") as HTMLInputElement | null;
  const searchButton = document.getElementById("logs-search-button") as HTMLButtonElement | null;
  const searchResults = document.getElementById("logs-search-results") as HTMLElement | null;
  if (!button || !modalEl || !select || !preview || !download || !enabled || !searchInput || !searchButton || !searchResults) return false;

  storage.getItem("loggingEnabled").then(res => {
    enabled.checked = res?.loggingEnabled !== false;
  });

  enabled.addEventListener("change", () => {
    storage.setItem("loggingEnabled", enabled.checked);
  });

  let db: IDBDatabase | null = null;
  let previewEntries: { element: HTMLElement; text: string; time: string }[] = [];
  let activeHighlight: HTMLElement | null = null;
  let highlightTimeout: number | null = null;

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  }

  function formatDateTime(ts: number): string {
    const d = new Date(ts);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da} ${formatTime(ts)}`;
  }

  const modal = new Modal(modalEl);

  function clearHighlight() {
    if (activeHighlight) {
      activeHighlight.classList.remove("logs-preview-highlight");
      activeHighlight = null;
    }
    if (highlightTimeout !== null) {
      window.clearTimeout(highlightTimeout);
      highlightTimeout = null;
    }
  }

  function highlightPreviewEntry(element: HTMLElement) {
    if (activeHighlight && activeHighlight !== element) {
      activeHighlight.classList.remove("logs-preview-highlight");
    }
    if (highlightTimeout !== null) {
      window.clearTimeout(highlightTimeout);
    }
    element.classList.add("logs-preview-highlight");
    activeHighlight = element;
    highlightTimeout = window.setTimeout(() => {
      element.classList.remove("logs-preview-highlight");
      if (activeHighlight === element) {
        activeHighlight = null;
      }
      highlightTimeout = null;
    }, 2000);
  }

  function scrollToPreviewEntry(element: HTMLElement) {
    const containerRect = preview.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const offset = elementRect.top - containerRect.top;
    const targetTop = Math.max(preview.scrollTop + offset - preview.clientHeight / 2, 0);
    preview.scrollTo({ top: targetTop, behavior: "smooth" });
    highlightPreviewEntry(element);
  }

  function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeFlags(flags: string): string {
    const filtered = flags.replace(/g/g, "");
    const parts = filtered.split("").filter(part => part !== "");
    return Array.from(new Set(parts)).join("");
  }

  function parseSearchQuery(query: string): { regex: RegExp | null; error?: string } {
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
            return { regex: null, error: "Niepoprawne wyrażenie regularne." };
          }
        }
        escaped = !escaped && char === "\\";
      }
    }
    try {
      return { regex: new RegExp(escapeRegExp(trimmed), "i") };
    } catch {
      return { regex: null, error: "Nie udało się utworzyć wyrażenia wyszukiwania." };
    }
  }

  function renderSearchMessage(message: string) {
    searchResults.innerHTML = "";
    const info = document.createElement("div");
    info.classList.add("logs-search-empty");
    info.textContent = message;
    searchResults.appendChild(info);
    searchResults.scrollTop = 0;
  }

  function renderSearchResults(matches: { entry: { element: HTMLElement; text: string; time: string }; match: RegExpExecArray }[]) {
    searchResults.innerHTML = "";
    for (const item of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.classList.add("logs-search-result");
      const timeSpan = document.createElement("span");
      timeSpan.classList.add("logs-search-result-time");
      timeSpan.textContent = item.entry.time;
      const textSpan = document.createElement("span");
      const matchIndex = item.match.index;
      const matchText = item.match[0];
      const before = item.entry.text.slice(0, matchIndex);
      const after = item.entry.text.slice(matchIndex + matchText.length);
      if (before) {
        textSpan.appendChild(document.createTextNode(before));
      }
      const highlight = document.createElement("mark");
      highlight.textContent = matchText;
      textSpan.appendChild(highlight);
      if (after) {
        textSpan.appendChild(document.createTextNode(after));
      }
      button.appendChild(timeSpan);
      button.appendChild(textSpan);
      button.addEventListener("click", () => {
        scrollToPreviewEntry(item.entry.element);
      });
      searchResults.appendChild(button);
    }
    searchResults.scrollTop = 0;
  }

  function runSearch() {
    const query = searchInput.value;
    const { regex, error } = parseSearchQuery(query);
    if (!query.trim()) {
      renderSearchMessage("Wpisz frazę wyszukiwania.");
      return;
    }
    if (!regex) {
      renderSearchMessage(error ?? "Nie udało się utworzyć wyrażenia wyszukiwania.");
      return;
    }
    const baseFlags = normalizeFlags(regex.flags);
    const searchRegex = new RegExp(regex.source, baseFlags);
    const matches: { entry: { element: HTMLElement; text: string; time: string }; match: RegExpExecArray }[] = [];
    for (const entry of previewEntries) {
      const match = searchRegex.exec(entry.text);
      if (match) {
        matches.push({ entry, match });
      }
    }
    if (matches.length === 0) {
      renderSearchMessage("Brak wyników.");
      return;
    }
    renderSearchResults(matches);
  }

  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("ArkadiaMessagesDB");
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }


  async function refreshSessions() {
    db?.close();
    db = await openDb();
    select.innerHTML = "";
    const names: string[] = [];
    for (let i = 0; i < db.objectStoreNames.length; i++) {
      const name = db.objectStoreNames.item(i);
      if (!name) continue;
      const tx = db.transaction(name, "readonly");
      const req = tx.objectStore(name).count();
      const count = await new Promise<number>((resolve) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });
      if (count > 0) {
        names.push(name);
      }
    }
    names.sort();
    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      const ts = parseInt(name.replace("session_", ""), 10);
      option.textContent = isNaN(ts) ? name : new Date(ts).toLocaleString();
      select.appendChild(option);
    }
    if (names.length > 0) {
      select.value = names[names.length - 1];
      loadPreview(select.value);
    } else {
      preview.innerHTML = "";
      previewEntries = [];
      clearHighlight();
      renderSearchMessage("Brak logów do wyświetlenia.");
    }
  }

  function splitLines(html: string): string[] {
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

  function loadPreview(storeName: string) {
    if (!db) return;
    preview.innerHTML = "";
    clearHighlight();
    previewEntries = [];
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => {
      const logs = req.result as LogEntry[];
      for (const entry of logs) {
        const lines = splitLines(entry.text);
        const time = formatTime(entry.timestamp);
        for (const line of lines) {
          const wrapper = document.createElement("div");
          wrapper.classList.add("output_msg");
          if (entry.type) {
            wrapper.classList.add(entry.type);
          }
          const msg = document.createElement("div");
          msg.classList.add("output_msg_text");
          msg.style.whiteSpace = "pre-wrap";
          const timeSpan = document.createElement("span");
          timeSpan.classList.add("log-time");
          timeSpan.textContent = time;
          const contentSpan = document.createElement("span");
          contentSpan.innerHTML = line;
          msg.appendChild(timeSpan);
          msg.appendChild(contentSpan);
          wrapper.appendChild(msg);
          preview.appendChild(wrapper);
          previewEntries.push({
            element: wrapper,
            text: contentSpan.textContent ?? "",
            time,
          });
        }
      }
      preview.scrollTop = preview.scrollHeight;
      if (searchInput.value.trim()) {
        runSearch();
      } else {
        renderSearchMessage("Wyniki wyszukiwania pojawią się tutaj.");
      }
    };
  }

  select.addEventListener("change", () => {
    if (select.value) {
      loadPreview(select.value);
    }
  });

  download.addEventListener("click", async () => {
    if (!select.value) return;
    if (!db) {
      db = await openDb();
    }
    const tx = db.transaction(select.value, "readonly");
    const req = tx.objectStore(select.value).getAll();
    req.onsuccess = () => {
      const logs = req.result as LogEntry[];
      const entries: string[] = [];
      for (const l of logs) {
        const time = formatDateTime(l.timestamp);
        const parts = splitLines(l.text);
        for (const part of parts) {
          const classes = ["output_msg"];
          if (l.type) {
            classes.push(l.type);
          }
          const lineHtml = `<div class="${classes.join(" ")}"><div class="output_msg_text" style="white-space:pre-wrap"><span class="log-time">${time}</span><span>${part}</span></div></div>`;
          entries.push(lineHtml);
        }
      }
      const inlineStyles: string[] = [];
      const linkTags: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from(sheet.cssRules);
          inlineStyles.push(rules.map(r => r.cssText).join("\n"));
        } catch {
          const href = (sheet as CSSStyleSheet).href;
          if (href) {
            linkTags.push(`<link rel="stylesheet" href="${href}">`);
          }
        }
      }
      inlineStyles.push("html, body { overflow: auto; } #logs-preview { height: auto; }");

      const head = `<meta charset=\"UTF-8\">\n${linkTags.join("\n")}\n<style>${inlineStyles.join("\n")}</style>`;
      const html = `<!doctype html><html lang=\"en\"><head>${head}</head><body><div id=\"logs-preview\">${entries.join("\n")}</div></body></html>`;
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${select.value}.html`;
        a.click();
        URL.revokeObjectURL(url);
      };
    });

  button.addEventListener("click", async () => {
    await refreshSessions();
    modal.show();
  });

  searchButton.addEventListener("click", () => {
    runSearch();
  });

  searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });

  searchInput.addEventListener("input", () => {
    if (!searchInput.value.trim()) {
      renderSearchMessage("Wyniki wyszukiwania pojawią się tutaj.");
    }
  });

  renderSearchMessage("Wyniki wyszukiwania pojawią się tutaj.");

  initialized = true;
  return true;
}

function ensureLogBrowser() {
  if (initLogBrowser()) return;
  const observer = new MutationObserver(() => {
    if (initLogBrowser()) {
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureLogBrowser);
} else {
  ensureLogBrowser();
}
