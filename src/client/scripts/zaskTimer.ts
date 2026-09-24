import Client from "../Client";
import { isDirection, isPolishDirection } from "@shared/map/directions.ts";

const SAFE_THRESHOLD_SECONDS = 30;
const SNEAK_COMMAND = /^przemknij\b/i;

interface ZaskTimerPayload {
    seconds: number;
    ok: boolean;
}

export default function initZaskTimer(client: Client) {
    let timer: number | null = null;
    let start = 0;
    let active = false;

    function clearTimer() {
        if (timer != null) {
            clearInterval(timer);
            timer = null;
        }
    }

    function emit(payload: ZaskTimerPayload | null) {
        client.sendEvent('zaskTimer', payload);
    }

    function stopTimer() {
        clearTimer();
        if (active) {
            active = false;
            emit(null);
        }
    }

    function updateTimer() {
        if (!active) return;
        const seconds = Math.floor((Date.now() - start) / 1000);
        if (seconds >= SAFE_THRESHOLD_SECONDS) {
            clearTimer();
            emit({ seconds, ok: true });
            // The per-second `zaskTimer` drives the display; this one-shot is
            // what user triggers bind to.
            client.sendEvent('zask.ready', { seconds });
        } else {
            emit({ seconds, ok: false });
        }
    }

    function startTimer() {
        start = client.now();
        active = true;
        clearTimer();
        updateTimer();
        timer = window.setInterval(updateTimer, 1000);
    }

    // Moves sent as `przemknij ...` without the move mode toggle (typed, walk
    // mode modifiers, plugins). One per queued sneak so a speedwalk keeps
    // counting; a plain step drops the rest, which also clears a sneak the
    // game refused.
    let pendingSneaks = 0;

    client.on('command', (command) => {
        const cmd = command.trim();
        if (SNEAK_COMMAND.test(cmd)) {
            pendingSneaks++;
        } else if (isDirection(cmd) || isPolishDirection(cmd)) {
            pendingSneaks = 0;
        }
    });

    client.on('gmcp.room.info', () => {
        const sneaked = pendingSneaks > 0;
        if (sneaked) pendingSneaks--;
        if (client.moveMode > 0 || sneaked) {
            startTimer();
        } else {
            stopTimer();
        }
    });

    client.Triggers.registerTrigger(/^Chowasz sie najlepiej jak potrafisz\.$/, (line) => {
        startTimer();
        return line;
    }, 'zask-timer');

    client.Triggers.registerTrigger(
        /^(?:Wychodzisz z ukrycia|Jest tu zbyt ciezko sie schowac, wiec jestes widoczny z powrotem)\.$/,
        (line) => {
            stopTimer();
            return line;
        },
        'zask-timer'
    );

    client.on('moveModeChanged', (mode) => {
        if (mode === 0) {
            stopTimer();
        }
    });

    emit(null);
}
