/**
 * Stock-UI bootstrap for the Logi window.
 *
 * Kept out of `LogBrowser.tsx` so that module stays side-effect free: forge-ui
 * hosts the same component inside its own modal shell, where stock's
 * `#logs-button` does not exist.
 *
 * The window itself is a design-system `Dialog` rather than the declarative
 * Bootstrap modal it used to be. That is what lets the shared viewer fill it:
 * `size="full"` is the large working surface the primitive was written for,
 * and Radix owns the focus trap, focus restore and scroll lock that the stock
 * modal used to provide. One of the three `bootstrap/js/dist/modal` import
 * sites goes away with it.
 */
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogClose } from "@design";
import { LogBrowser } from "./LogBrowser";

let initialized = false;
let warned = false;

function LogBrowserWindow({ button }: { button: HTMLButtonElement }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const show = () => setOpen(true);
        button.addEventListener("click", show);
        return () => button.removeEventListener("click", show);
    }, [button]);

    // Mounted only while open, so closing the window lets go of every session
    // it had loaded — and of the database connection underneath them.
    const onOpenChange = useCallback((next: boolean) => setOpen(next), []);

    return (
        <Dialog open={open} onOpenChange={onOpenChange} className="logs-dialog">
            {open ? <LogBrowser headerTrailing={<DialogClose />} /> : null}
        </Dialog>
    );
}

function initLogBrowser(): boolean {
    if (initialized) return true;

    const button = document.getElementById("logs-button") as HTMLButtonElement | null;
    if (!button) return false;

    const host = document.createElement("div");
    host.id = "logs-react-root";
    // The dialog portals to <body>; this element only anchors the React root.
    host.style.display = "contents";
    document.body.appendChild(host);

    void import("react-dom/client").then(({ createRoot }) => {
        createRoot(host).render(<LogBrowserWindow button={button} />);
    });

    initialized = true;
    return true;
}

function ensureLogBrowser() {
    if (initLogBrowser()) return;
    // The button is static in `index.html`, so this only covers markup that is
    // injected later. Warn once instead of on every mutation.
    if (!warned) {
        warned = true;
        console.warn("[Logs] #logs-button not present yet, waiting for it");
    }
    const observer = new MutationObserver(() => {
        if (initLogBrowser()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureLogBrowser);
} else {
    ensureLogBrowser();
}
