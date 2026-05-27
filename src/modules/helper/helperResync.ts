// Dedicated place to re-establish helper-side session state on (re)connect.
//
// The helper process keeps its session state — window-match patterns, hotkey
// binds — in memory only, so a restart (e.g. an auto-update) or any reconnect
// wipes it. Browser focus and ping are already re-sent by HelperConnection on
// open; everything else that must survive a reconnect belongs here so it
// restores regardless of which UI panels happen to be mounted.

import type { HelperConnection } from "./HelperConnection";
import { loadBinds, toHelperBind } from "./helperBinds";

// Window titles the helper watches to decide whether the game window is focused.
export const HELPER_WINDOW_MATCH_PATTERNS = ["Arkadia", "arkadia.rpg.pl"];

/**
 * Subscribe to the connection so all helper-side state is pushed every time it
 * reaches 'connected' (initial connect and every reconnect). Returns an
 * unsubscribe function.
 */
export function setupHelperResync(helper: HelperConnection): () => void {
    const resync = () => {
        helper.send({ type: "set_window_match", patterns: HELPER_WINDOW_MATCH_PATTERNS });
        helper.send({ type: "register_binds", binds: loadBinds().map(toHelperBind) });
    };
    return helper.onStateChange((state) => {
        if (state === "connected") resync();
    });
}
