// Dedicated place to re-establish helper-side session state on (re)connect.
//
// The helper process keeps its session state — window-match patterns, hotkey
// binds — in memory only, so a restart (e.g. an auto-update) or any reconnect
// wipes it. Browser focus and ping are already re-sent by HelperConnection on
// open; everything else that must survive a reconnect belongs here so it
// restores regardless of which UI panels happen to be mounted.

import type { HelperConnection } from "./HelperConnection";
import { loadBinds, toHelperBind } from "./helperBinds";

/**
 * Last-resort titles, used only when this page somehow has none of its own.
 *
 * They are deliberately not sent otherwise: a browser window's title is just
 * its active tab's, so nothing generic identifies *this* client, while "Arkadia"
 * happily matches a chat window sitting in a channel named after the game or an
 * editor with the repository open — and raising one of those is worse than
 * raising nothing.
 */
export const HELPER_WINDOW_MATCH_PATTERNS = ["Arkadia", "arkadia.rpg.pl"];

/**
 * What the helper matches windows against: this page's own live title.
 *
 * A window only carries it while the client is the active tab, which is exactly
 * when raising that window lands on the client. Nothing here can switch tabs —
 * tab ids belong to browser extensions, and no page or native program can ask
 * the browser to activate one — so in a background tab the honest outcome is
 * that nothing matches and nothing is raised. Running the client as an
 * installed app gives it a window of its own and the question goes away.
 */
export function windowMatchPatterns(): string[] {
    const own = typeof document !== "undefined" ? document.title.trim() : "";
    return own ? [own] : [...HELPER_WINDOW_MATCH_PATTERNS];
}

/** True when the client has a window of its own (installed as an app). */
export function isStandaloneWindow(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(display-mode: standalone)").matches
        || window.matchMedia?.("(display-mode: window-controls-overlay)").matches
        || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Subscribe to the connection so all helper-side state is pushed every time it
 * reaches 'connected' (initial connect and every reconnect). The patterns are
 * pushed again whenever the tab title changes — combat and HP write into it —
 * so the helper never matches on a title that has moved on. Returns an
 * unsubscribe function.
 */
export function setupHelperResync(helper: HelperConnection): () => void {
    const sendPatterns = () => helper.send({ type: "set_window_match", patterns: windowMatchPatterns() });

    const resync = () => {
        sendPatterns();
        helper.send({ type: "register_binds", binds: loadBinds().map(toHelperBind) });
    };
    const unsubscribe = helper.onStateChange((state) => {
        if (state === "connected") resync();
    });

    const titleElement = typeof document !== "undefined" ? document.querySelector("title") : null;
    const observer = titleElement
        ? new MutationObserver(() => {
            if (helper.getState() === "connected") sendPatterns();
        })
        : null;
    observer?.observe(titleElement!, { childList: true, characterData: true, subtree: true });

    return () => {
        observer?.disconnect();
        unsubscribe();
    };
}
