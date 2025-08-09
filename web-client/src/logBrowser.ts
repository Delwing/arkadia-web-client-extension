import Modal from "bootstrap/js/dist/modal";

interface LogEntry {
  text: string;
  type?: string;
  timestamp: number;
}

function initLogBrowser() {
  const button = document.getElementById("logs-button") as HTMLButtonElement | null;
  const modalEl = document.getElementById("logs-modal") as HTMLElement | null;
  const select = document.getElementById("logs-session-select") as HTMLSelectElement | null;
  const preview = document.getElementById("logs-preview") as HTMLElement | null;
  const download = document.getElementById("logs-download") as HTMLButtonElement | null;
  if (!button || !modalEl || !select || !preview || !download) return;

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
      if (name) names.push(name);
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
        const lines = entry.text.split(/\r?\n/);
        const time = new Date(entry.timestamp).toLocaleTimeString();
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
          timeSpan.textContent = `[${time}] `;
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
        const time = new Date(l.timestamp).toLocaleString();
        const parts = l.text.split(/\r?\n/);
        for (const part of parts) {
          const classes = ["output_msg"];
          if (l.type) {
            classes.push(l.type);
          }
            const lineHtml = `<div class="${classes.join(" ")}"><div class="output_msg_text" style="white-space:pre-wrap"><span>[${time}] </span><span>${part}</span></div></div>`;
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

        const head = `<meta charset="UTF-8">\n${linkTags.join("\n")}\n<style>${inlineStyles.join("\n")}</style>`;
        const html = `<!doctype html><html lang="en"><head>${head}</head><body><div id="main_text_output_msg_wrapper">${entries.join("\n")}</div></body></html>`;
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
}

document.addEventListener("DOMContentLoaded", initLogBrowser);
