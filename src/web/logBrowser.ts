import Modal from "bootstrap/js/dist/modal";
import storage from "@modules/core/storage";

interface LogEntry {
  text: string;
  type?: string;
  timestamp: number;
}

let initialized = false;

function initLogBrowser(): boolean {
  if (initialized) {
    console.log("[Logs] Already initialized, skipping");
    return true;
  }
  console.log("[Logs] Initializing log browser...");
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
  if (!button || !modalEl || !select || !preview || !download || !enabled || !searchInput || !searchButton || !searchResults || !searchControls || !searchPrev || !searchNext) {
    console.error("[Logs] Failed to find required elements:", { button: !!button, modalEl: !!modalEl, select: !!select, preview: !!preview, download: !!download, enabled: !!enabled, searchInput: !!searchInput, searchButton: !!searchButton, searchResults: !!searchResults, searchControls: !!searchControls, searchPrev: !!searchPrev, searchNext: !!searchNext });
    return false;
  }
  console.log("[Logs] All required elements found, setting up event listeners...");

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
    totalResults: number;
  }

  interface SearchResultData {
    sessionName: string;
    sessionLabel: string;
    groupTimestamp: number;
    groupDateTime: string;
    matches: LineMatch[];
    button: HTMLButtonElement;
    count: HTMLSpanElement;
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
  let activeHighlight: HTMLElement[] = [];
  let highlightTimeout: number | null = null;
  let currentSessionName: string | null = null;
  let searchRequestId = 0;
  let activeResultRequestId = 0;
  let loadingOverlay: HTMLElement | null = null;

  function createLoadingOverlay(): HTMLElement {
    const overlay = document.createElement("div");
    overlay.classList.add("logs-loading-overlay");
    const spinner = document.createElement("div");
    spinner.classList.add("logs-loading-spinner");
    overlay.appendChild(spinner);
    return overlay;
  }

  function showLoading() {
    try {
      console.log("[Logs] showLoading() called, preview element:", preview);
      if (!loadingOverlay) {
        loadingOverlay = createLoadingOverlay();
        console.log("[Logs] Created loading overlay");
      }
      if (!preview.contains(loadingOverlay)) {
        preview.appendChild(loadingOverlay);
        console.log("[Logs] Appended loading overlay to preview");
      }
    } catch (error) {
      console.error("[Logs] Error in showLoading():", error);
    }
  }

  function hideLoading() {
    if (loadingOverlay && preview.contains(loadingOverlay)) {
      preview.removeChild(loadingOverlay);
    }
  }

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
      console.error(`Cannot get session data for ${storeName} - database not available`);
      return [];
    }
    return new Promise(resolve => {
      let tx: IDBTransaction;
      try {
        tx = db!.transaction(storeName, "readonly");
      } catch (error) {
        console.error(`Failed to create transaction for ${storeName}:`, error);
        resolve([]);
        return;
      }
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => {
        const logs = req.result as LogEntry[];
        console.log(`Loaded ${logs.length} entries from ${storeName}`);
        resolve(parseLogEntries(logs));
      };
      req.onerror = () => {
        console.error(`Failed to read from ${storeName}:`, req.error);
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
    clearHighlight();
    updateNavigationButtons();
  }

  function renderSearchMessage(message: string, isProgress = false) {
    searchResults.innerHTML = "";
    searchResults.hidden = false;
    searchControls.hidden = true;
    searchPrev.disabled = true;
    searchNext.disabled = true;
    searchResultsData = [];
    searchSessionsData = [];
    activeResultIndex = -1;
    clearHighlight();
    const info = document.createElement("div");
    info.classList.add(isProgress ? "logs-search-progress" : "logs-search-empty");
    info.textContent = message;
    searchResults.appendChild(info);
    searchResults.scrollTop = 0;
    updateNavigationButtons();
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

  function setActiveSession(session: SearchSessionData | null) {
    for (const entry of searchSessionsData) {
      if (entry === session) {
        entry.container.classList.add("logs-search-session-active");
      } else {
        entry.container.classList.remove("logs-search-session-active");
      }
    }
  }

  function updateNavigationButtons() {
    if (searchResultsData.length === 0) {
      searchPrev.disabled = true;
      searchNext.disabled = true;
      return;
    }
    if (activeResultIndex === -1) {
      searchPrev.disabled = true;
      searchNext.disabled = false;
      return;
    }
    const isAtFirst = activeResultIndex === 0;
    const isAtLast = activeResultIndex === searchResultsData.length - 1;
    searchPrev.disabled = isAtFirst;
    searchNext.disabled = isAtLast;
  }

  function focusResultMatches(matches: LineMatch[], { scrollPreview }: { scrollPreview: boolean }) {
    const elements: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();
    for (const match of matches) {
      if (!match.element) continue;
      if (seen.has(match.element)) continue;
      seen.add(match.element);
      elements.push(match.element);
    }
    if (elements.length === 0) {
      clearHighlight();
      return;
    }
    if (scrollPreview) {
      scrollToPreviewElement(elements[0]);
    }
    highlightPreviewElements(elements);
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
    { scrollPreview, ensureVisible }: { scrollPreview: boolean; ensureVisible: boolean },
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
    if (ensureVisible) {
      active.button.scrollIntoView({ block: "nearest" });
    }
    focusResultMatches(active.matches, { scrollPreview });
    updateNavigationButtons();
  }

  function renderSearchResults(matches: RenderableSearchResult[]) {
    searchResults.innerHTML = "";
    searchResults.hidden = false;
    searchControls.hidden = false;
    searchResultsData = [];
    searchSessionsData = [];
    activeResultIndex = -1;
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
          totalResults: 0,
        };
        sessionsByName.set(item.sessionName, session);
        searchSessionsData.push(session);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.classList.add("logs-search-result");
      const timeSpan = document.createElement("span");
      timeSpan.classList.add("logs-search-result-time");
      timeSpan.textContent = item.groupDateTime;
      const snippetSpan = document.createElement("span");
      snippetSpan.classList.add("logs-search-result-snippet");
      const firstMatch = item.matches[0];
      snippetSpan.appendChild(createResultSnippet(firstMatch.lineText, firstMatch.matchIndex, firstMatch.text));
      const countSpan = document.createElement("span");
      countSpan.classList.add("logs-search-result-count");
      countSpan.textContent = `(${item.matches.length})`;
      button.appendChild(timeSpan);
      button.appendChild(snippetSpan);
      button.appendChild(countSpan);
      const resultIndex = searchResultsData.length;
      button.addEventListener("click", () => {
        void setActiveResult(resultIndex, { scrollPreview: true, ensureVisible: true });
      });
      session.resultsContainer.appendChild(button);
      session.totalResults += 1;
      session.count.textContent = `(${session.totalResults})`;
      searchResultsData.push({
        sessionName: item.sessionName,
        sessionLabel: item.sessionLabel,
        groupTimestamp: item.groupTimestamp,
        groupDateTime: item.groupDateTime,
        matches: item.matches,
        button,
        count: countSpan,
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
    renderSearchMessage("Wyszukiwanie…", true);
    const baseFlags = normalizeFlags(regex.flags);
    const globalFlags = `${baseFlags}g`;
    const results: RenderableSearchResult[] = [];
    for (let i = 0; i < sessionInfos.length; i++) {
      const session = sessionInfos[i];
      renderSearchMessage(`Wyszukiwanie… (${i + 1}/${sessionInfos.length})`, true);
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

  function openDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      try {
        console.log("[Logs] Creating IndexedDB open request...");
        const request = indexedDB.open("ArkadiaMessagesDB");

        request.onsuccess = () => {
          console.log("[Logs] IndexedDB opened successfully");
          resolve(request.result);
        };
        request.onerror = () => {
          console.error("[Logs] Failed to open IndexedDB:", request.error);
          resolve(null);
        };
        request.onblocked = () => {
          console.warn("[Logs] IndexedDB open request blocked - waiting for other connections to close");
        };
        request.onupgradeneeded = () => {
          console.log("[Logs] IndexedDB upgrade needed - but we're only reading, this shouldn't happen");
        };
      } catch (error) {
        console.error("[Logs] Error opening IndexedDB:", error);
        resolve(null);
      }
    });
  }


  async function refreshSessions() {
    console.log("[Logs] refreshSessions() called");
    showLoading();
    console.log("[Logs] Loading indicator shown");
    try {
      console.log("[Logs] Checking database connection, db is:", db ? "already open" : "null");
      // Only reopen if not already open
      if (!db) {
        console.log("[Logs] Opening database...");
        db = await openDb();
        console.log("[Logs] Database open result:", db ? "success" : "failed");
      }
      select.innerHTML = "";
      sessionInfos = [];
      if (!db) {
        preview.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--bs-danger);"><h5>❌ Nie udało się otworzyć bazy danych logów</h5><p>Wystąpił błąd podczas otwierania bazy danych.</p><p style="font-size: 0.875rem; color: var(--bs-secondary-color);">Sprawdź konsolę przeglądarki aby zobaczyć szczegóły błędu.</p></div>';
        logGroups = [];
        currentSessionName = null;
        clearHighlight();
        renderSearchMessage("Nie udało się otworzyć bazy danych.");
        console.error("[Logs] IndexedDB failed to open - check previous console errors for details");
        return;
      }
      const available: { name: string; label: string }[] = [];
      for (let i = 0; i < db.objectStoreNames.length; i++) {
        const name = db.objectStoreNames.item(i);
        if (!name) continue;
        try {
          const tx = db.transaction(name, "readonly");
          const req = tx.objectStore(name).count();
          const count = await new Promise<number>(resolve => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(0);
          });
          if (count > 0) {
            available.push({ name, label: formatSessionLabel(name) });
          }
        } catch (error) {
          console.error(`Error accessing session ${name}:`, error);
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
    } catch (error) {
      console.error("Error refreshing sessions:", error);
      preview.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--bs-danger);"><h5>❌ Wystąpił błąd</h5><p>Nie udało się załadować sesji logów.</p><p style="font-size: 0.875rem; color: var(--bs-secondary-color);">Sprawdź konsolę przeglądarki aby zobaczyć szczegóły.</p></div>';
      renderSearchMessage("Wystąpił błąd podczas ładowania.");
    } finally {
      hideLoading();
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
    showLoading();
    try {
      if (!db) {
        db = await openDb();
      }
      if (!db) {
        hideLoading();
        return;
      }
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
    } finally {
      hideLoading();
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
    console.log("[Logs] Button clicked, opening modal...");
    // Show modal immediately so user sees the loading indicator
    modal.show();
    console.log("[Logs] Modal shown, refreshing sessions...");
    await refreshSessions();
    console.log("[Logs] Sessions refresh complete");
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
      if (activeResultIndex > 0) {
        await setActiveResult(activeResultIndex - 1, { scrollPreview: true, ensureVisible: true });
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
      if (activeResultIndex < searchResultsData.length - 1) {
        await setActiveResult(activeResultIndex + 1, { scrollPreview: true, ensureVisible: true });
      }
    })();
  });

  clearSearchResults();

  initialized = true;
  console.log("[Logs] Initialization complete");
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
