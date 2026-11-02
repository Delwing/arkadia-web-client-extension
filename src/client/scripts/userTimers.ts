import Client from "../Client";
import { globalStorage } from "@modules/core/storage";
import { isAutomationActiveNow, onAutomationScopeChange, type AutomationMeta } from "@modules/core/automation";
import { applyLinelessMacro, type UserMacro } from "./userTriggers";
import { setTimerControlHandler, type TimerControl } from "./userTimerControl";

/**
 * A timer in Skrypty: actions that run every `seconds`, or once `seconds`
 * after it starts counting.
 *
 * It counts only while a character is in the game (from Char.Info, or a
 * resumed proxy session, to the disconnect), so nothing is typed into the
 * login prompt.
 *
 * When it starts:
 * - `start: "auto"` (absent): whenever it becomes active - the session
 *   starts, it or its group is switched on, its character logs in, or it is
 *   edited. A one-off fires once per such start.
 * - `start: "action"`: only when a "timer" action (in a trigger, an alias,
 *   another timer) starts it. A one-off then waits for the next start.
 *
 * A "timer" action can also start an automatic timer again from zero, or stop
 * it until it next becomes active. What actions started and stopped is kept in
 * memory, for the session: writing it to storage would sync on every trigger.
 */
export interface UserTimer extends AutomationMeta {
    /** Seconds between runs (or before the one run). */
    seconds: number;
    /** Run once after `seconds` instead of every `seconds`. */
    once?: boolean;
    /** What starts it; absent means "auto". */
    start?: "auto" | "action";
    /** Actions run in order; only the ones that need no line (`LINELESS_MACRO_TYPES`). */
    macros: UserMacro[];
}

export const TIMERS_KEY = "automationTimers";

/** Shorter would flood the game with commands. */
export const MIN_TIMER_SECONDS = 1;
/** A day; anything longer outlives every session anyway. */
export const MAX_TIMER_SECONDS = 24 * 60 * 60;

export function isValidTimerSeconds(seconds: unknown): seconds is number {
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= MIN_TIMER_SECONDS && seconds <= MAX_TIMER_SECONDS;
}

export function getUserTimers(): UserTimer[] {
    const value = globalStorage.get(TIMERS_KEY);
    return Array.isArray(value) ? value : [];
}

/** `co 30 s`, `raz po 1 min 30 s`: how often a timer runs, in a few words. */
export function timerLabel(timer: Pick<UserTimer, "seconds" | "once">): string {
    const s = timer.seconds;
    let text: string;
    if (!isValidTimerSeconds(s)) text = "?";
    else if (s < 60 || s % 1 !== 0) text = `${s} s`;
    else {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const rest = s % 60;
        text = [h ? `${h} h` : "", m ? `${m} min` : "", rest ? `${rest} s` : ""].filter(Boolean).join(" ");
    }
    return timer.once ? `raz po ${text}` : `co ${text}`;
}

/** What makes a running timer start over when it changes. */
function signature(timer: UserTimer): string {
    return JSON.stringify([timer.seconds, !!timer.once, timer.start ?? "auto", timer.macros]);
}

interface Running {
    signature: string;
    handle: ReturnType<typeof setTimeout>;
}

export default function initUserTimers(client: Client) {
    const running = new Map<string, Running>();
    /** "action" timers an action started, until they stop or the session ends. */
    const started = new Set<string>();
    /** "auto" timers an action stopped, until they next become active. */
    const halted = new Set<string>();
    let inGame = false;

    const fire = (id: string, fallback: UserTimer) => {
        // Read at fire time, so a rename shows in the script console without restarting the count.
        const timer = getUserTimers().find(t => t.id === id) ?? fallback;
        if (timer.once && timer.start === "action") {
            // Done until started again.
            started.delete(id);
            running.delete(id);
        }
        const call = { args: [], options: { source: "timer" as const, label: timer.name?.trim() || timerLabel(timer) } };
        for (const macro of timer.macros ?? []) {
            applyLinelessMacro(client, macro, text => text, call);
        }
    };

    const stop = (id: string) => {
        const entry = running.get(id);
        if (!entry) return;
        clearTimeout(entry.handle);
        clearInterval(entry.handle);
        running.delete(id);
    };

    const apply = () => {
        const active = inGame
            ? getUserTimers().filter(t => t.id && isValidTimerSeconds(t.seconds) && t.macros?.length && isAutomationActiveNow(t))
            : [];
        const activeIds = new Set(active.map(t => t.id!));
        // Becoming inactive ends what actions did to it: the next activation starts afresh.
        for (const id of [...started, ...halted]) {
            if (!activeIds.has(id)) {
                started.delete(id);
                halted.delete(id);
            }
        }
        const wanted = active.filter(t => (t.start === "action" ? started.has(t.id!) : !halted.has(t.id!)));
        const next = new Map(wanted.map(t => [t.id!, signature(t)]));
        for (const [id, entry] of running) {
            if (next.get(id) !== entry.signature) stop(id);
        }
        for (const timer of wanted) {
            const id = timer.id!;
            // Already counting, or an automatic one-off that has fired and waits for its next start.
            if (running.has(id)) continue;
            const ms = timer.seconds * 1000;
            const handle = timer.once
                ? setTimeout(() => fire(id, timer), ms)
                : setInterval(() => fire(id, timer), ms);
            running.set(id, { signature: next.get(id)!, handle });
        }
    };

    const control = (id: string, what: TimerControl) => {
        const timer = getUserTimers().find(t => t.id === id);
        if (!timer || !inGame || !isAutomationActiveNow(timer)) return;
        stop(id);
        if (what === "start") {
            halted.delete(id);
            if (timer.start === "action") started.add(id);
        } else {
            started.delete(id);
            if (timer.start !== "action") halted.add(id);
        }
        apply();
    };
    setTimerControlHandler(control);

    const setInGame = (value: boolean) => {
        if (inGame === value) return;
        inGame = value;
        if (!value) {
            started.clear();
            halted.clear();
        }
        apply();
    };

    client.on("gmcp.char.info", () => setInGame(true));
    client.on("proxy.session", info => {
        // A resumed session gets no new Char.Info: the character is still in the game.
        if (info?.resumed && !info.upstreamClosed) setInGame(true);
        if (info?.type === "ended") setInGame(false);
    });
    client.on("client.connect", () => setInGame(false));
    client.on("client.disconnect", () => setInGame(false));

    globalStorage.onChange(TIMERS_KEY, () => apply());
    onAutomationScopeChange(apply);
}
