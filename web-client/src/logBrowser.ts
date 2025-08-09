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
  const openRequest = indexedDB.open("ArkadiaMessagesDB");
  openRequest.onsuccess = () => {
    db = openRequest.result;
    refreshSessions();
  };

  const modal = new Modal(modalEl);

  function refreshSessions() {
    if (!db) return;
    select.innerHTML = "";
    const names = Array.from(db.objectStoreNames);
    names.sort();
    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      const ts = parseInt(name.replace("session_", ""), 10);
      option.textContent = isNaN(ts) ? name : new Date(ts).toLocaleString();
      select.appendChild(option);
    }
    if (select.value) {
      loadPreview(select.value);
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
        const line = document.createElement("div");
        const time = new Date(entry.timestamp).toLocaleTimeString();
        line.textContent = `[${time}] ${entry.text}`;
        preview.appendChild(line);
      }
      preview.scrollTop = preview.scrollHeight;
    };
  }

  select.addEventListener("change", () => {
    if (select.value) {
      loadPreview(select.value);
    }
  });

  download.addEventListener("click", () => {
    if (!db || !select.value) return;
    const tx = db.transaction(select.value, "readonly");
    const req = tx.objectStore(select.value).getAll();
    req.onsuccess = () => {
      const logs = req.result as LogEntry[];
      const content = logs
        .map((l) => `${new Date(l.timestamp).toISOString()} ${l.text}`)
        .join("\n");
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${select.value}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    };
  });

  button.addEventListener("click", () => {
    refreshSessions();
    if (select.value) {
      loadPreview(select.value);
    }
    modal.show();
  });
}

document.addEventListener("DOMContentLoaded", initLogBrowser);
