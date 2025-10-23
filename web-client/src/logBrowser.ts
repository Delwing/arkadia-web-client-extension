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
  interface LogLine {
    element: HTMLElement;
    text: string;
  }

  interface LogGroup {
    timestamp: number;
    time: string;
    dateTime: string;
    lines: LogLine[];
  }

  interface ParsedLogLine {
    html: string;
    text: string;
  }

  interface ParsedLogGroup {
    timestamp: number;
    time: string;
    dateTime: string;
    type?: string;
    lines: ParsedLogLine[];
  }

  interface LineMatch {
    element: HTMLElement | null;
    lineIndex: number;
    matchIndex: number;
    text: string;
    lineText: string;
  }

  interface SearchSessionData {
    sessionName: string;
    sessionLabel: string;
    container: HTMLElement;
    count: HTMLSpanElement;
    resultsContainer: HTMLElement;
    totalMatches: number;
  }

  interface SearchResultData {
    sessionName: string;
    sessionLabel: string;
    groupTimestamp: number;
    groupDateTime: string;
    matches: LineMatch[];
    button: HTMLButtonElement;
    count: HTMLSpanElement;
    activeMatchIndex: number;
    session: SearchSessionData;
  }

  interface RenderableSearchResult {
    sessionName: string;
    sessionLabel: string;
    groupTimestamp: number;
    groupDateTime: string;
    matches: LineMatch[];
  }

  let logGroups: LogGroup[] = [];
  let sessionInfos: { name: string; label: string }[] = [];
  let searchResultsData: SearchResultData[] = [];
  let searchSessionsData: SearchSessionData[] = [];
  let activeResultIndex = -1;
  let activeSession: SearchSessionData | null = null;
  let activeHighlight: HTMLElement[] = [];
  let highlightTimeout: number | null = null;
  let currentSessionName: string | null = null;
  let searchRequestId = 0;
  let activeResultRequestId = 0;

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
  const textParser = document.createElement("div");

  function formatSessionLabel(name: string): string {
    if (name.startsWith("session_")) {
      const ts = parseInt(name.slice("session_".length), 10);
      if (!Number.isNaN(ts)) {
        return new Date(ts).toLocaleString();
      }
    }
    return name;
  }

  function parseLogEntries(entries: LogEntry[]): ParsedLogGroup[] {
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

  async function getSessionData(storeName: string): Promise<ParsedLogGroup[]> {
    if (!db) {
      db = await openDb();
    }
    if (!db) {
      return [];
    }
    return new Promise(resolve => {
      let tx: IDBTransaction;
      try {
        tx = db!.transaction(storeName, "readonly");
      } catch {
        resolve([]);
        return;
      }
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => {
        const logs = req.result as LogEntry[];
        resolve(parseLogEntries(logs));
      };
      req.onerror = () => {
        resolve([]);
      };
    });
  }

  function syncResultElementsForSession(sessionName: string | null) {
    if (!sessionName || currentSessionName !== sessionName) {
      return;
    }
    const groupByTimestamp = new Map<number, LogGroup>();
    for (const group of logGroups) {
      groupByTimestamp.set(group.timestamp, group);
    }
    for (const result of searchResultsData) {
      if (result.sessionName !== sessionName) continue;
      const group = groupByTimestamp.get(result.groupTimestamp);
      if (!group) continue;
      for (const match of result.matches) {
        const line = group.lines[match.lineIndex];
        match.element = line?.element ?? null;
        match.lineText = line?.text ?? match.lineText;
      }
    }
  }

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

  function focusLogMatch(match: LineMatch, { scroll }: { scroll: boolean }) {
    if (!match.element) {
      return;
    }
    if (scroll) {
      scrollToPreviewElement(match.element);
    }
    highlightPreviewElements([match.element]);
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
    searchSessionsData = [];
    activeResultIndex = -1;
    activeSession = null;
    clearHighlight();
  }

  function renderSearchMessage(message: string) {
    searchResults.innerHTML = "";
    searchResults.hidden = false;
    searchControls.hidden = true;
    searchPrev.disabled = true;
    searchNext.disabled = true;
    searchResultsData = [];
    searchSessionsData = [];
    activeResultIndex = -1;
    activeSession = null;
    clearHighlight();
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

  function refreshResultCount(index: number) {
    const result = searchResultsData[index];
    if (!result) return;
    if (activeResultIndex === index) {
      result.count.textContent = `(${result.activeMatchIndex + 1}/${result.matches.length})`;
    } else {
      result.count.textContent = `(${result.matches.length})`;
    }
  }

  function refreshAllResultCounts() {
    searchResultsData.forEach((_, i) => refreshResultCount(i));
  }

  function setActiveSession(session: SearchSessionData | null) {
    activeSession = session;
    for (const entry of searchSessionsData) {
      if (entry === session) {
        entry.container.classList.add("logs-search-session-active");
      } else {
        entry.container.classList.remove("logs-search-session-active");
      }
    }
  }

  function updateNavigationButtons() {
    if (searchResultsData.length === 0 || activeResultIndex === -1) {
      searchPrev.disabled = true;
      searchNext.disabled = searchResultsData.length === 0;
      return;
    }
    const active = searchResultsData[activeResultIndex];
    const isAtFirst = activeResultIndex === 0 && active.activeMatchIndex === 0;
    const isAtLast =
      activeResultIndex === searchResultsData.length - 1 &&
      active.activeMatchIndex === active.matches.length - 1;
    searchPrev.disabled = isAtFirst;
    searchNext.disabled = isAtLast;
  }

  function setActiveMatch(
    resultIndex: number,
    matchIndex: number,
    { scrollPreview, ensureVisible }: { scrollPreview: boolean; ensureVisible: boolean },
  ) {
    if (resultIndex < 0 || resultIndex >= searchResultsData.length) return;
    const result = searchResultsData[resultIndex];
    if (matchIndex < 0 || matchIndex >= result.matches.length) return;
    result.activeMatchIndex = matchIndex;
    const match = result.matches[matchIndex];
    focusLogMatch(match, { scroll: scrollPreview });
    if (ensureVisible) {
      result.button.scrollIntoView({ block: "nearest" });
    }
    refreshAllResultCounts();
    updateNavigationButtons();
  }

  async function ensureResultSessionLoaded(result: SearchResultData): Promise<void> {
    if (currentSessionName === result.sessionName) {
      syncResultElementsForSession(result.sessionName);
      return;
    }
    select.value = result.sessionName;
    await loadPreview(result.sessionName, { triggerSearch: false });
  }

  async function setActiveResult(
    index: number,
    {
      scrollPreview,
      ensureVisible,
      matchIndex,
    }: { scrollPreview: boolean; ensureVisible: boolean; matchIndex?: number },
  ) {
    if (index < 0 || index >= searchResultsData.length) {
      return;
    }
    const requestId = ++activeResultRequestId;
    activeResultIndex = index;
    searchResultsData.forEach((item, i) => {
      if (i === index) {
        item.button.classList.add("logs-search-result-active");
      } else {
        item.button.classList.remove("logs-search-result-active");
      }
    });
    const active = searchResultsData[index];
    await ensureResultSessionLoaded(active);
    if (requestId !== activeResultRequestId) {
      return;
    }
    setActiveSession(active.session);
    const targetMatchIndex = Math.min(
      Math.max(matchIndex ?? (active.activeMatchIndex >= 0 ? active.activeMatchIndex : 0), 0),
      active.matches.length - 1,
    );
    setActiveMatch(index, targetMatchIndex, { scrollPreview, ensureVisible });
  }

  function renderSearchResults(matches: RenderableSearchResult[]) {
    searchResults.innerHTML = "";
    searchResults.hidden = false;
    searchControls.hidden = false;
    searchResultsData = [];
    searchSessionsData = [];
    activeResultIndex = -1;
    activeSession = null;
    const sessionsByName = new Map<string, SearchSessionData>();
    matches.forEach(item => {
      let session = sessionsByName.get(item.sessionName);
      if (!session) {
        const sessionContainer = document.createElement("div");
        sessionContainer.classList.add("logs-search-session");
        const header = document.createElement("div");
        header.classList.add("logs-search-session-header");
        const title = document.createElement("span");
        title.classList.add("logs-search-session-title");
        title.textContent = item.sessionLabel;
        const count = document.createElement("span");
        count.classList.add("logs-search-session-count");
        count.textContent = "(0)";
        header.appendChild(title);
        header.appendChild(count);
        const resultsContainer = document.createElement("div");
        resultsContainer.classList.add("logs-search-session-results");
        sessionContainer.appendChild(header);
        sessionContainer.appendChild(resultsContainer);
        searchResults.appendChild(sessionContainer);
        session = {
          sessionName: item.sessionName,
          sessionLabel: item.sessionLabel,
          container: sessionContainer,
          count,
          resultsContainer,
          totalMatches: 0,
        };
        sessionsByName.set(item.sessionName, session);
        searchSessionsData.push(session);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.classList.add("logs-search-result");
      const header = document.createElement("div");
      header.classList.add("logs-search-result-header");
      const sessionSpan = document.createElement("span");
      sessionSpan.classList.add("logs-search-result-session");
      sessionSpan.textContent = item.sessionLabel;
      const timeSpan = document.createElement("span");
      timeSpan.classList.add("logs-search-result-time");
      timeSpan.textContent = item.groupDateTime;
      const countSpan = document.createElement("span");
      countSpan.classList.add("logs-search-result-count");
      countSpan.textContent = `(${item.matches.length})`;
      header.appendChild(sessionSpan);
      header.appendChild(timeSpan);
      header.appendChild(countSpan);
      const snippetSpan = document.createElement("span");
      snippetSpan.classList.add("logs-search-result-snippet");
      const firstMatch = item.matches[0];
      snippetSpan.appendChild(createResultSnippet(firstMatch.lineText, firstMatch.matchIndex, firstMatch.text));
      button.appendChild(header);
      button.appendChild(snippetSpan);
      const resultIndex = searchResultsData.length;
      button.addEventListener("click", () => {
        void setActiveResult(resultIndex, { scrollPreview: true, ensureVisible: true });
      });
      session.resultsContainer.appendChild(button);
      session.totalMatches += item.matches.length;
      session.count.textContent = `(${session.totalMatches})`;
      searchResultsData.push({
        sessionName: item.sessionName,
        sessionLabel: item.sessionLabel,
        groupTimestamp: item.groupTimestamp,
        groupDateTime: item.groupDateTime,
        matches: item.matches,
        button,
        count: countSpan,
        activeMatchIndex: 0,
        session,
      });
    });
    searchResults.scrollTop = 0;
    if (searchResultsData.length > 0) {
      void setActiveResult(0, { scrollPreview: true, ensureVisible: true });
    } else {
      updateNavigationButtons();
    }
  }

  async function runSearch() {
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
    if (sessionInfos.length === 0) {
      renderSearchMessage("Brak logów do wyświetlenia.");
      return;
    }
    const requestId = ++searchRequestId;
    renderSearchMessage("Wyszukiwanie…");
    const baseFlags = normalizeFlags(regex.flags);
    const globalFlags = `${baseFlags}g`;
    const results: RenderableSearchResult[] = [];
    for (const session of sessionInfos) {
      const groups = await getSessionData(session.name);
      if (requestId !== searchRequestId) {
        return;
      }
      for (const group of groups) {
        const groupMatches: LineMatch[] = [];
        for (let lineIndex = 0; lineIndex < group.lines.length; lineIndex++) {
          const line = group.lines[lineIndex];
          if (!line.text) continue;
          const matcher = new RegExp(regex.source, globalFlags);
          let match: RegExpExecArray | null;
          while ((match = matcher.exec(line.text)) !== null) {
            if (match[0].length === 0) {
              matcher.lastIndex += 1;
              continue;
            }
            groupMatches.push({
              element: null,
              lineIndex,
              matchIndex: match.index,
              text: match[0],
              lineText: line.text,
            });
          }
        }
        if (groupMatches.length > 0) {
          results.push({
            sessionName: session.name,
            sessionLabel: session.label,
            groupTimestamp: group.timestamp,
            groupDateTime: group.dateTime,
            matches: groupMatches,
          });
        }
      }
    }
    if (requestId !== searchRequestId) {
      return;
    }
    if (results.length === 0) {
      renderSearchMessage("Brak wyników.");
      return;
    }
    renderSearchResults(results);
    syncResultElementsForSession(currentSessionName);
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
    sessionInfos = [];
    if (!db) {
      preview.innerHTML = "";
      logGroups = [];
      currentSessionName = null;
      clearHighlight();
      renderSearchMessage("Brak logów do wyświetlenia.");
      return;
    }
    const available: { name: string; label: string }[] = [];
    for (let i = 0; i < db.objectStoreNames.length; i++) {
      const name = db.objectStoreNames.item(i);
      if (!name) continue;
      const tx = db.transaction(name, "readonly");
      const req = tx.objectStore(name).count();
      const count = await new Promise<number>(resolve => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });
      if (count > 0) {
        available.push({ name, label: formatSessionLabel(name) });
      }
    }
    available.sort((a, b) => a.name.localeCompare(b.name));
    for (const info of available) {
      const option = document.createElement("option");
      option.value = info.name;
      option.textContent = info.label;
      select.appendChild(option);
    }
    sessionInfos = available;
    if (sessionInfos.length > 0) {
      const latest = sessionInfos[sessionInfos.length - 1];
      select.value = latest.name;
      await loadPreview(latest.name);
    } else {
      preview.innerHTML = "";
      logGroups = [];
      currentSessionName = null;
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

  async function loadPreview(storeName: string, options?: { triggerSearch?: boolean }) {
    if (!db) {
      db = await openDb();
    }
    if (!db) return;
    preview.innerHTML = "";
    clearHighlight();
    logGroups = [];
    const groups = await getSessionData(storeName);
    for (const group of groups) {
      const lineItems: LogLine[] = [];
      for (const line of group.lines) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("output_msg");
        if (group.type) {
          wrapper.classList.add(group.type);
        }
        const msg = document.createElement("div");
        msg.classList.add("output_msg_text");
        msg.style.whiteSpace = "pre-wrap";
        const timeSpan = document.createElement("span");
        timeSpan.classList.add("log-time");
        timeSpan.textContent = group.time;
        const contentSpan = document.createElement("span");
        contentSpan.innerHTML = line.html;
        msg.appendChild(timeSpan);
        msg.appendChild(contentSpan);
        wrapper.appendChild(msg);
        preview.appendChild(wrapper);
        lineItems.push({
          element: wrapper,
          text: contentSpan.textContent ?? "",
        });
      }
      logGroups.push({
        timestamp: group.timestamp,
        time: group.time,
        dateTime: group.dateTime,
        lines: lineItems,
      });
    }
    currentSessionName = storeName;
    preview.scrollTop = preview.scrollHeight;
    syncResultElementsForSession(storeName);
    if (options?.triggerSearch === false) {
      updateNavigationButtons();
      return;
    }
    if (searchInput.value.trim()) {
      void runSearch();
    } else {
      clearSearchResults();
    }
  }

  select.addEventListener("change", () => {
    if (select.value) {
      void loadPreview(select.value);
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
    void runSearch();
  });

  searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runSearch();
    }
  });

  searchInput.addEventListener("input", () => {
    if (!searchInput.value.trim()) {
      clearSearchResults();
    }
  });

  searchPrev.addEventListener("click", () => {
    void (async () => {
      if (activeResultIndex === -1) {
        return;
      }
      const active = searchResultsData[activeResultIndex];
      if (active.activeMatchIndex > 0) {
        setActiveMatch(activeResultIndex, active.activeMatchIndex - 1, { scrollPreview: true, ensureVisible: false });
        return;
      }
      if (activeResultIndex > 0) {
        const previousIndex = activeResultIndex - 1;
        const previous = searchResultsData[previousIndex];
        await setActiveResult(previousIndex, {
          scrollPreview: true,
          ensureVisible: true,
          matchIndex: previous.matches.length - 1,
        });
      }
    })();
  });

  searchNext.addEventListener("click", () => {
    void (async () => {
      if (activeResultIndex === -1) {
        if (searchResultsData.length > 0) {
          await setActiveResult(0, { scrollPreview: true, ensureVisible: true });
        }
        return;
      }
      const active = searchResultsData[activeResultIndex];
      if (active.activeMatchIndex < active.matches.length - 1) {
        setActiveMatch(activeResultIndex, active.activeMatchIndex + 1, { scrollPreview: true, ensureVisible: false });
        return;
      }
      if (activeResultIndex < searchResultsData.length - 1) {
        await setActiveResult(activeResultIndex + 1, { scrollPreview: true, ensureVisible: true });
      }
    })();
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
