import { LogBrowser } from "./LogBrowser";

// Stock-UI bootstrap for the Logi browser. Kept out of `LogBrowser.tsx` so that
// module stays side-effect free: forge-ui and the log viewer import the React
// components directly and host them in their own shells, where stock's
// `#logs-button` / `#logs-modal` do not exist.

let initialized = false;
let warned = false;

function initLogBrowser(): boolean {
  if (initialized) return true;

  const button = document.getElementById("logs-button") as HTMLButtonElement | null;
  const modalEl = document.getElementById("logs-modal") as HTMLElement | null;

  if (!button || !modalEl) return false;

  // Find or create container for React component
  const modalBody = modalEl.querySelector(".modal-body");
  if (!modalBody) {
    console.error("[Logs] Failed to find modal body");
    return false;
  }

  // Create React root container
  const reactContainer = document.createElement("div");
  reactContainer.id = "logs-react-root";
  reactContainer.style.display = "contents";

  // Clear existing content and add React container
  modalBody.innerHTML = "";
  modalBody.appendChild(reactContainer);

  // Mount React component and setup modal
  Promise.all([
    import("react-dom/client"),
    import("bootstrap/js/dist/modal")
  ]).then(([{ createRoot }, { default: Modal }]) => {
    const root = createRoot(reactContainer);
    root.render(<LogBrowser />);

    // Setup button click handler
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
