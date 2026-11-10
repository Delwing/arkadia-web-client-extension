import { useCallback, useEffect, useRef, useState } from "react";
import { bindCodeOf } from "@modules/core/numpadKeys";
import type { HelperConnection } from "@modules/helper/HelperConnection";
import { fromHelperKey, MODIFIER_CODES, type Combo, type KeyEntry } from "./keysModel";

/** What a capture assigns the next keystroke to. */
export type CaptureTarget =
    | { kind: "entry"; entry: KeyEntry }
    /** A helper hotkey for a built-in bind (a second key), or the window-summoning one. */
    | { kind: "new-helper"; target: string; label: string }
    /** An own shortcut the helper hears; its command is typed in afterwards. */
    | { kind: "new-helper-command"; label: string };

export interface Capture {
    target: CaptureTarget;
    /** The helper listens (it hears keys the browser keeps), or the page does. */
    via: "browser" | "helper";
}

export type LiveMods = Pick<Combo, "ctrl" | "alt" | "shift">;

const NO_MODS: LiveMods = { ctrl: false, alt: false, shift: false };

interface Options {
    helperConnection: HelperConnection | null | undefined;
    helperConnected: boolean;
    numLockAware: boolean;
    /** The key pressed for `capture` (null: Backspace, clear the key). */
    onCaptured: (capture: Capture, combo: Combo | null) => void;
    onNotice: (text: string) => void;
}

/**
 * Waiting for the next keystroke. The page listens first in line, so no game
 * bind or dialog sees the key; for a helper hotkey the helper listens instead,
 * since it hears keys the browser keeps (Ctrl+W).
 */
export function useKeyCapture({ helperConnection, helperConnected, numLockAware, onCaptured, onNotice }: Options) {
    const [capture, setCapture] = useState<Capture | null>(null);
    const [liveMods, setLiveMods] = useState<LiveMods>(NO_MODS);

    const handlers = useRef({ onCaptured, onNotice, capture });
    handlers.current = { onCaptured, onNotice, capture };

    const cancel = useCallback(() => setCapture(null), []);

    /** Ends the capture with `combo` (a key, a key picked on the drawing, or null to clear). */
    const finish = useCallback((combo: Combo | null) => {
        const c = handlers.current.capture;
        setCapture(null);
        if (c) handlers.current.onCaptured(c, combo);
    }, []);

    const start = useCallback((target: CaptureTarget) => {
        const helperEntry = target.kind !== "entry" || target.entry.ref.kind === "helper";
        const via = helperEntry && helperConnected ? "helper" : "browser";
        setLiveMods(NO_MODS);
        setCapture({ target, via });
        if (via === "helper") helperConnection?.send({ type: "start_capture" });
    }, [helperConnected, helperConnection]);

    useEffect(() => {
        if (!capture || capture.via !== "browser") return;
        const onKey = (ev: KeyboardEvent) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            setLiveMods({ ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey });
            if (MODIFIER_CODES.has(ev.code) || !ev.code) return;
            const bare = !ev.ctrlKey && !ev.altKey && !ev.shiftKey;
            if (bare && ev.code === "Escape") {
                setCapture(null);
                return;
            }
            if (bare && ev.code === "Backspace") {
                finish(null);
                return;
            }
            finish({ code: bindCodeOf(ev, numLockAware), ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey });
        };
        const onKeyUp = (ev: KeyboardEvent) => setLiveMods({ ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey });
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKeyUp, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("keyup", onKeyUp, true);
        };
    }, [capture, numLockAware, finish]);

    useEffect(() => {
        if (!capture || capture.via !== "helper" || !helperConnection) return;
        return helperConnection.onKeyCaptured(msg => {
            if (!msg.key) {
                setCapture(null);
                return;
            }
            const combo = fromHelperKey(msg.key);
            if (combo) finish(combo);
            else {
                setCapture(null);
                handlers.current.onNotice(`Nieznany klawisz: ${msg.key}`);
            }
        });
    }, [capture, helperConnection, finish]);

    return { capture, liveMods, start, cancel, finish };
}
