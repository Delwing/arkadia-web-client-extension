import Client from "../Client";
import { gmcp } from "../gmcp";

/** How long before the game logs us out the warning appears. */
export const IDLE_WARNING_MS = 60_000;
const TOAST_KEY = 'idle.logout';
const TICK_MS = 1000;

/**
 * Warns in the last minute before the game logs an idle character out.
 *
 * The game says how long it waits in `char.options.max_idle_time` (minutes)
 * and counts from the last line we sent it, so the clock restarts on every
 * line that actually reaches the socket - not on aliases that never leave
 * the client.
 */
export default function initIdleLogout(client: Client) {
    let connected = false;
    let lastSentAt = Date.now();
    let warnTimer: ReturnType<typeof setTimeout> | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let shown = false;
    /** The limit the current schedule was built for. */
    let scheduledFor: number | null = null;

    const maxIdleMs = (): number | null => {
        const minutes = Number(gmcp?.char?.options?.max_idle_time);
        return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : null;
    };

    const formatLeft = (ms: number) => {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    };

    const stop = () => {
        if (warnTimer !== null) clearTimeout(warnTimer);
        if (tickTimer !== null) clearInterval(tickTimer);
        warnTimer = tickTimer = null;
        if (shown) {
            shown = false;
            client.sendEvent('notify.dismiss', { key: TOAST_KEY });
        }
    };

    /** Shows the time left; false once there is nothing left to count. */
    const tick = (): boolean => {
        const max = maxIdleMs();
        if (max === null) {
            stop();
            return false;
        }
        const left = Math.max(0, lastSentAt + max - Date.now());
        client.sendEvent('notify', {
            key: TOAST_KEY,
            // Later ticks only move the bar; closed by hand, it stays closed.
            update: shown,
            level: 'warning',
            source: 'client',
            sticky: true,
            title: 'Czas do wylogowania przez nieaktywność',
            text: `${formatLeft(left)} - wyślij dowolną komendę, aby zostać w grze.`,
            progress: { value: Math.min(left, IDLE_WARNING_MS), max: IDLE_WARNING_MS },
            // The player is most likely away from the tab: reach them there too.
            system: !shown,
        });
        shown = true;
        return left > 0;
    };

    const schedule = () => {
        stop();
        const max = maxIdleMs();
        scheduledFor = max;
        if (!connected || max === null) return;
        const warnIn = lastSentAt + max - IDLE_WARNING_MS - Date.now();
        warnTimer = setTimeout(() => {
            warnTimer = null;
            if (!tick()) return;
            tickTimer = setInterval(() => {
                if (tick() || tickTimer === null) return;
                clearInterval(tickTimer);
                tickTimer = null;
            }, TICK_MS);
        }, Math.max(0, warnIn));
    };

    client.on('socket.sent', () => {
        lastSentAt = Date.now();
        schedule();
    });
    client.on('client.connect', () => {
        connected = true;
        // A fresh session: the game starts counting from the login.
        lastSentAt = Date.now();
        schedule();
    });
    client.on('client.disconnect', () => {
        connected = false;
        stop();
    });
    // The limit can arrive (or change) at any time during the session. Other
    // options change too, and must not restart a warning already on screen.
    client.on('gmcp.char.options', () => {
        const max = maxIdleMs();
        if (connected && max !== scheduledFor) schedule();
    });
}
