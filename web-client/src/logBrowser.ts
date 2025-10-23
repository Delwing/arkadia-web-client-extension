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
  const searchControls = document.getElementById("logs-search-controls") as HTMLElement | null;
  const searchPrev = document.getElementById("logs-search-prev") as HTMLButtonElement | null;
  const searchNext = document.getElementById("logs-search-next") as HTMLButtonElement | null;
  const searchResults = document.getElementById("logs-search-results") as HTMLElement | null;
  if (!button || !modalEl || !select || !preview || !download || !enabled || !searchInput || !searchButton || !searchResults || !searchControls || !searchPrev || !searchNext) return false;

  storage.getItem("loggingEnabled").then(res => {
    enabled.checked = res?.loggingEnabled !== false;
  });

  enabled.addEventListener("change", () => {
    storage.setItem("loggingEnabled", enabled.checked);
  });

  let db: IDBDatabase | null = null;
  interface LogGroup {
    time: string;
    elements: HTMLElement[];
    text: string;
  }

  interface SearchResultData {
    group: LogGroup;
    count: number;
    button: HTMLButtonElement;
  }

  let logGroups: LogGroup[] = [];
  let searchResultsData: SearchResultData[] = [];
  let activeResultIndex = -1;
  let activeHighlight: HTMLElement[] = [];
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
    if (activeHighlight.length > 0) {
      for (const element of activeHighlight) {
        element.classList.remove("logs-preview-highlight");
      }
      activeHighlight = [];
    }
    if (highlightTimeout !== null) {
      window.clearTimeout(highlightTimeout);
      highlightTimeout = null;
    }
  }

  function highlightPreviewElements(elements: HTMLElement[]) {
    if (highlightTimeout !== null) {
      window.clearTimeout(highlightTimeout);
      highlightTimeout = null;
    }
    if (activeHighlight.length > 0) {
      for (const element of activeHighlight) {
        element.classList.remove("logs-preview-highlight");
      }
    }
    if (elements.length === 0) {
      activeHighlight = [];
      return;
    }
    for (const element of elements) {
      element.classList.add("logs-preview-highlight");
    }
    activeHighlight = elements;
    highlightTimeout = window.setTimeout(() => {
      for (const element of elements) {
        element.classList.remove("logs-preview-highlight");
      }
      if (activeHighlight === elements) {
        activeHighlight = [];
      }
      highlightTimeout = null;
    }, 2000);
  }

  function scrollToPreviewElement(element: HTMLElement) {
    const containerRect = preview.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const offset = elementRect.top - containerRect.top;
    const targetTop = Math.max(preview.scrollTop + offset - preview.clientHeight / 2, 0);
    preview.scrollTo({ top: targetTop, behavior: "smooth" });
  }

  function focusLogGroup(group: LogGroup, { scroll }: { scroll: boolean }) {
    if (group.elements.length === 0) return;
    const target = group.elements[0];
    if (scroll) {
      scrollToPreviewElement(target);
    }
    highlightPreviewElements(group.elements);
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

  function clearSearchResults() {
    searchResults.innerHTML = "";
    searchResults.hidden = true;
    searchControls.hidden = true;
    searchPrev.disabled = true;
    searchNext.disabled = true;
    searchResultsData = [];
    activeResultIndex = -1;
  }

  function renderSearchMessage(message: string) {
    searchResults.innerHTML = "";
    searchResults.hidden = false;
    searchControls.hidden = true;
    searchPrev.disabled = true;
    searchNext.disabled = true;
    searchResultsData = [];
    activeResultIndex = -1;
    const info = document.createElement("div");
    info.classList.add("logs-search-empty");
    info.textContent = message;
    searchResults.appendChild(info);
    searchResults.scrollTop = 0;
  }

  function createResultSnippet(text: string, matchIndex: number, matchText: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const windowSize = 60;
    const start = Math.max(0, matchIndex - windowSize);
    const end = Math.min(text.length, matchIndex + matchText.length + windowSize);
    const prefix = text.slice(start, matchIndex).replace(/\s+/g, " ");
    const suffix = text.slice(matchIndex + matchText.length, end).replace(/\s+/g, " ");
    const normalizedMatch = matchText.replace(/\s+/g, " ");
    if (start > 0) {
      fragment.append("…");
    }
    if (prefix) {
      fragment.append(prefix);
    }
    const highlight = document.createElement("mark");
    highlight.textContent = normalizedMatch;
    fragment.append(highlight);
    if (suffix) {
      fragment.append(suffix);
    }
    if (end < text.length) {
      fragment.append("…");
    }
    return fragment;
  }

  function updateNavigationButtons() {
    if (searchResultsData.length === 0 || activeResultIndex === -1) {
      searchPrev.disabled = true;
      searchNext.disabled = searchResultsData.length === 0;
      return;
    }
    searchPrev.disabled = activeResultIndex <= 0;
    searchNext.disabled = activeResultIndex >= searchResultsData.length - 1;
  }

  function setActiveResult(index: number, { scrollPreview, ensureVisible }: { scrollPreview: boolean; ensureVisible: boolean }) {
    if (index < 0 || index >= searchResultsData.length) {
      return;
    }
    activeResultIndex = index;
    searchResultsData.forEach((item, i) => {
      if (i === index) {
        item.button.classList.add("logs-search-result-active");
      } else {
        item.button.classList.remove("logs-search-result-active");
      }
    });
    const active = searchResultsData[index];
    if (ensureVisible) {
      active.button.scrollIntoView({ block: "nearest" });
    }
    focusLogGroup(active.group, { scroll: scrollPreview });
    updateNavigationButtons();
  }

  function renderSearchResults(matches: { group: LogGroup; matches: { index: number; text: string }[] }[]) {
    searchResults.innerHTML = "";
    searchResults.hidden = false;
    searchControls.hidden = false;
    searchResultsData = [];
    activeResultIndex = -1;
    matches.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.classList.add("logs-search-result");
      const timeSpan = document.createElement("span");
      timeSpan.classList.add("logs-search-result-time");
      timeSpan.textContent = item.group.time;
      const snippetSpan = document.createElement("span");
      snippetSpan.classList.add("logs-search-result-snippet");
      const firstMatch = item.matches[0];
      snippetSpan.appendChild(createResultSnippet(item.group.text, firstMatch.index, firstMatch.text));
      const countSpan = document.createElement("span");
      countSpan.classList.add("logs-search-result-count");
      countSpan.textContent = `(${item.matches.length})`;
      button.appendChild(timeSpan);
      button.appendChild(snippetSpan);
      button.appendChild(countSpan);
      button.addEventListener("click", () => {
        setActiveResult(index, { scrollPreview: true, ensureVisible: true });
      });
      searchResults.appendChild(button);
      searchResultsData.push({
        group: item.group,
        count: item.matches.length,
        button,
      });
    });
    searchResults.scrollTop = 0;
    if (searchResultsData.length > 0) {
      setActiveResult(0, { scrollPreview: true, ensureVisible: true });
    } else {
      updateNavigationButtons();
    }
  }

  function runSearch() {
    const query = searchInput.value;
    const trimmed = query.trim();
    const { regex, error } = parseSearchQuery(query);
    if (!trimmed) {
      renderSearchMessage("Wpisz frazę wyszukiwania.");
      return;
    }
    if (!regex) {
      renderSearchMessage(error ?? "Nie udało się utworzyć wyrażenia wyszukiwania.");
      return;
    }
    const baseFlags = normalizeFlags(regex.flags);
    const globalFlags = `${baseFlags}g`;
    const results: { group: LogGroup; matches: { index: number; text: string }[] }[] = [];
    for (const group of logGroups) {
      if (!group.text) continue;
      const matcher = new RegExp(regex.source, globalFlags);
      const groupMatches: { index: number; text: string }[] = [];
      let match: RegExpExecArray | null;
      while ((match = matcher.exec(group.text)) !== null) {
        if (match[0].length === 0) {
          matcher.lastIndex += 1;
          continue;
        }
        groupMatches.push({ index: match.index, text: match[0] });
      }
      if (groupMatches.length > 0) {
        results.push({ group, matches: groupMatches });
      }
    }
    if (results.length === 0) {
      renderSearchMessage("Brak wyników.");
      return;
    }
    renderSearchResults(results);
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
      logGroups = [];
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
    logGroups = [];
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => {
      const logs = req.result as LogEntry[];
      for (const entry of logs) {
        const lines = splitLines(entry.text);
        const time = formatTime(entry.timestamp);
        const elements: HTMLElement[] = [];
        const textParts: string[] = [];
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
          elements.push(wrapper);
          textParts.push(contentSpan.textContent ?? "");
        }
        logGroups.push({
          time,
          elements,
          text: textParts.join("\n"),
        });
      }
      preview.scrollTop = preview.scrollHeight;
      if (searchInput.value.trim()) {
        runSearch();
      } else {
        clearSearchResults();
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
      clearSearchResults();
      clearHighlight();
    }
  });

  searchPrev.addEventListener("click", () => {
    if (activeResultIndex > 0) {
      setActiveResult(activeResultIndex - 1, { scrollPreview: true, ensureVisible: true });
    }
  });

  searchNext.addEventListener("click", () => {
    if (activeResultIndex === -1) {
      if (searchResultsData.length > 0) {
        setActiveResult(0, { scrollPreview: true, ensureVisible: true });
      }
      return;
    }
    if (activeResultIndex < searchResultsData.length - 1) {
      setActiveResult(activeResultIndex + 1, { scrollPreview: true, ensureVisible: true });
    }
  });

  clearSearchResults();

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
