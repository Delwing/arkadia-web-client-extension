/**
 * Stock-UI bootstrap for the Logi window.
 *
 * Kept out of `LogBrowser.tsx` so that module stays side-effect free: forge-ui
 * hosts the same component inside its own modal shell, where stock's
 * `#logs-button` / `#logs-modal` do not exist.
 *
 * The browser is mounted only while the window is open. It loads every session
 * into memory when it mounts, and the client must not read the whole log
 * database at startup; unmounting on close also lets go of those sessions and
 * of the database connection underneath them, which is what lets another tab
 * create its own session (see `e2e/logs-multi-tab.spec.ts`).
 */
import { useEffect, useState } from "react";
import { LogBrowser } from "./LogBrowser";

let initialized = false;
let warned = false;

function LogBrowserWindow({ modalEl }: { modalEl: HTMLElement }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const show = () => setOpen(true);
        const hide = () => setOpen(false);
        modalEl.addEventListener("show.bs.modal", show);
        modalEl.addEventListener("hidden.bs.modal", hide);
        return () => {
            modalEl.removeEventListener("show.bs.modal", show);
            modalEl.removeEventListener("hidden.bs.modal", hide);
        };
    }, [modalEl]);

    return open ? <LogBrowser /> : null;
}

function initLogBrowser(): boolean {
  if (initialized) return true;

  const button = document.getElementById("logs-button") as HTMLButtonElement | null;
  const modalEl = document.getElementById("logs-modal") as HTMLElement | null;

  if (!button || !modalEl) return false;

  const modalBody = modalEl.querySelector(".modal-body");
  if (!modalBody) {
    console.error("[Logs] Failed to find modal body");
    return false;
  }

  // Create React root container
  const reactContainer = document.createElement("div");
  reactContainer.id = "logs-react-root";
  reactContainer.style.display = "contents";

  modalBody.innerHTML = "";
  modalBody.appendChild(reactContainer);

  Promise.all([
    import("react-dom/client"),
    import("bootstrap/js/dist/modal")
  ]).then(([{ createRoot }, { default: Modal }]) => {
    const root = createRoot(reactContainer);
    root.render(<LogBrowserWindow modalEl={modalEl} />);

    const modal = new Modal(modalEl);
    button.addEventListener("click", () => {
      modal.show();
    });
  });

  initialized = true;
  return true;
}

function ensureLogBrowser() {
  if (initLogBrowser()) return;
  // The elements are static in `index.html`, so this only covers markup that is
  // injected later. Warn once instead of on every mutation.
  if (!warned) {
    warned = true;
    console.warn("[Logs] #logs-button / #logs-modal not present yet, waiting for them");
  }
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
