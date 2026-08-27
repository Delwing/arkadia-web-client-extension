/**
 * When the game event currently being dispatched actually happened.
 *
 * Output does not always reach the client promptly. The session proxy replays what
 * arrived while a phone's tab was frozen, and the recorder replays a whole session long
 * after the fact — in both cases anything stamping `Date.now()` records when the client
 * got round to reading a line, not when the game produced it. A combat timer would start
 * a fresh countdown for a fight that finished five minutes ago; a recorded session would
 * date every event to playback time.
 *
 * The rule for callers is short:
 *
 *   - stamping *when something happened* → `eventNow()`
 *   - measuring *how long ago* it happened → `Date.now()`
 *
 * And the case that decides most of the rest: **only output can be replayed.** Anything
 * driven by the player's own command — an alias firing, a command being sent, the timing
 * between a command and its reply — happens live by definition and stays on the wall
 * clock. `/staz` and `/postepy_reset` are aliases, not game events, which is why they
 * keep `Date.now()`.
 *
 * A timer stamped with an old event time and ticked against the wall clock reads as
 * already expired, which is what you want, and it keeps the change to one line per
 * script rather than a rewrite.
 *
 * Deliberately module state rather than a parameter: it has to reach trigger callbacks
 * and GMCP listeners several layers below whoever knows the timestamp, and threading it
 * through every signature would touch far more code than it is worth.
 */

let currentEventTime: number | undefined;

/**
 * The time to stamp events with: the current event's own, or the wall clock when the
 * output is live and carries none.
 */
export function eventNow(): number {
    return currentEventTime ?? Date.now();
}

/** Whether a dispatch is in progress with a known event time (i.e. replayed output). */
export function isReplaying(): boolean {
    return currentEventTime !== undefined;
}

/**
 * Run `fn` with the event clock set to `at`, restoring it afterwards.
 *
 * Restores rather than clears, so nesting — a GMCP envelope dispatched while a line is
 * being processed — does not strand the outer dispatch on the wall clock. Restores on
 * throw too: a failing trigger must not leave every later event dated to a moment that
 * has passed.
 */
export function runWithEventTime<T>(at: number | undefined, fn: () => T): T {
    const previous = currentEventTime;
    currentEventTime = at;
    try {
        return fn();
    } finally {
        currentEventTime = previous;
    }
}
