import Modal from "bootstrap/js/dist/modal";
import storage from "@client/src/storage";
import { formatDateTime, formatTime, splitLines } from "./utils/logFormatting";

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
  if (!button || !modalEl || !select || !preview || !download || !enabled) return false;

  storage.getItem("loggingEnabled").then(res => {
    enabled.checked = res?.loggingEnabled !== false;
  });

  enabled.addEventListener("change", () => {
    storage.setItem("loggingEnabled", enabled.checked);
  });

  let db: IDBDatabase | null = null;

  const modal = new Modal(modalEl);

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
    }
  }

  function loadPreview(storeName: string) {
    if (!db) return;
    preview.innerHTML = "";
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
        }
      }
      preview.scrollTop = preview.scrollHeight;
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
