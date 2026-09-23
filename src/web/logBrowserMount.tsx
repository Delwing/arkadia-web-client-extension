/**
 * Stock-UI bootstrap for the Logi window.
 *
 * Kept out of `LogBrowser.tsx` so that module stays side-effect free: forge-ui
 * hosts the same component inside its own modal shell, where stock's
 * `#logs-modal` does not exist.
 *
 * The browser is mounted only while the window is open. It lists every session
 * when it mounts, and the client must not touch the log database at startup;
 * unmounting on close also stops a listing still under way and lets go of the
 * parsed logs and the database connection underneath them, which is what lets
 * another tab create its own session (see `e2e/logs-multi-tab.spec.ts`).
 */
import { useEffect, useState } from "react";
import { LogBrowser } from "./LogBrowser";
import { registerMainMenuItem } from "@modules/core/mainMenuRegistry";
import { setLogSearchHandler } from "./logSearchRequest";
import { AppModal, MODAL_EVENT } from "./modals/appModal";

let initialized = false;
let warned = false;
/** The query "Szukaj w logach" asked for, taken by the next opening. */
let pendingQuery: string | undefined;

export function LogBrowserWindow({ modalEl }: { modalEl: HTMLElement }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState<string | undefined>();

    useEffect(() => {
        const show = () => {
            setQuery(pendingQuery);
            pendingQuery = undefined;
            setOpen(true);
        };
        const hide = () => setOpen(false);
        modalEl.addEventListener(MODAL_EVENT.show, show);
        modalEl.addEventListener(MODAL_EVENT.hidden, hide);
        return () => {
            modalEl.removeEventListener(MODAL_EVENT.show, show);
            modalEl.removeEventListener(MODAL_EVENT.hidden, hide);
        };
    }, [modalEl]);

    return open ? <LogBrowser initialQuery={query} /> : null;
}

function initLogBrowser(): boolean {
  if (initialized) return true;

  const modalEl = document.getElementById("logs-modal") as HTMLElement | null;

  if (!modalEl) return false;

  const modalBody = modalEl.querySelector(".app-modal__body");
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

  void import("react-dom/client").then(({ createRoot }) => {
    const root = createRoot(reactContainer);
    root.render(<LogBrowserWindow modalEl={modalEl} />);

    const modal = AppModal.for(modalEl);
    showModal = () => modal.show();
    if (openRequested) showModal();
  });

  // In the menu at once; a click before the chunks above arrive opens it when they do.
  let showModal: (() => void) | null = null;
  let openRequested = false;
  const open = () => {
    if (showModal) showModal();
    else openRequested = true;
  };
  registerMainMenuItem({
    id: "logs-button",
    label: "Logi",
    group: "narzedzia",
    icon: "file-text",
    order: 170,
    source: "builtin",
    onSelect: open,
  });
  setLogSearchHandler((query) => {
    pendingQuery = query;
    open();
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
    console.warn("[Logs] #logs-modal not present yet, waiting for it");
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
