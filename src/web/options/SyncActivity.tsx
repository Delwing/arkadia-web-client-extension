import { useEffect, useState } from "react";
import { Button } from "@web-ui/primitives/index.ts";
import { syncEngine } from "@modules/firebase";
import {
    clearSyncActivity,
    getSyncActivity,
    onSyncActivity,
    type SyncActivityEntry,
} from "@modules/firebase/syncActivityLog";
import { getSyncV2Status } from "@web/userData/syncV2";

const LEVEL_CLASS: Record<SyncActivityEntry['level'], string> = {
    info: 'popup-muted',
    success: 'popup-text-success',
    warning: 'popup-text-warning',
    error: 'popup-text-danger',
};

/** "4:05" */
function formatCountdown(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** "5 min", "15 s" */
function formatInterval(ms: number): string {
    return ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`;
}

function formatTime(at: number): string {
    return new Date(at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** The current time, updated every second. */
function useNow(): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    return now;
}

interface TimerRow {
    label: string;
    value: string;
}

/** The scheduled syncs, one row per pending timer. */
function timerRows(syncV2: boolean, now: number): TimerRow[] {
    if (!syncV2) {
        const { hot, cold } = syncEngine.getScheduledAutoSyncs();
        const rows: TimerRow[] = [];
        if (hot !== null) rows.push({ label: 'Ustawienia i dane', value: `za ${formatCountdown(hot - now)}` });
        if (cold !== null) rows.push({ label: 'Licznik zabitych, odwiedzone lokacje', value: `za ${formatCountdown(cold - now)}` });
        return rows;
    }
    const status = getSyncV2Status();
    switch (status.state) {
        case 'running':
            if (status.nextUploadAt === null) return [];
            return [{
                label: status.watchedByOthers ? 'Wysylanie (inne urzadzenie jest aktywne)' : 'Wysylanie',
                value: `za ${formatCountdown(status.nextUploadAt - now)}`
                    + (status.uploadIntervalMs ? ` (co ${formatInterval(status.uploadIntervalMs)})` : ''),
            }];
        case 'waiting':
            return status.retryAt === null
                ? []
                : [{ label: 'Ponowna proba uruchomienia', value: `za ${formatCountdown(status.retryAt - now)}` }];
        case 'other-tab':
            return [{ label: 'Synchronizacja dziala w innej karcie tej przegladarki', value: '' }];
        default:
            return [];
    }
}

interface SyncTimersProps {
    syncV2: boolean;
}

/** Countdowns to the scheduled syncs, for the auto-sync box. Renders nothing when none is pending. */
export function SyncTimers({ syncV2 }: SyncTimersProps) {
    const rows = timerRows(syncV2, useNow());
    if (rows.length === 0) return null;
    return (
        <ul className="sync-timers popup-small">
            {rows.map(row => (
                <li key={row.label} className="sync-timers__row">
                    <span className="popup-muted">{row.label}</span>
                    {row.value && <span className="sync-timers__value">{row.value}</span>}
                </li>
            ))}
        </ul>
    );
}

/** The last things sync did in this tab, newest first, in a short scrolling box. */
export function SyncActivityLog() {
    const [entries, setEntries] = useState(getSyncActivity);
    useEffect(() => onSyncActivity(setEntries), []);

    return (
        <div className="sync-log">
            <div className="sync-log__header popup-small">
                <span className="popup-muted">Dziennik synchronizacji</span>
                {entries.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={clearSyncActivity}>
                        Wyczysc
                    </Button>
                )}
            </div>
            <ul className="sync-log__list">
                {entries.length === 0 ? (
                    <li className="popup-muted">Brak wpisow w tej sesji.</li>
                ) : (
                    [...entries].reverse().map(entry => (
                        <li key={entry.id} className="sync-log__entry">
                            <span className="popup-muted">{formatTime(entry.at)}</span>
                            <span className={LEVEL_CLASS[entry.level]}>{entry.text}</span>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
}
