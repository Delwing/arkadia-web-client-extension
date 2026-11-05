import { useEffect, useState } from "react";
import { Button } from "@web-ui/primitives/index.ts";
import { syncEngine } from "@modules/firebase";
import {
    clearSyncActivity,
    getSyncActivity,
    onSyncActivity,
    type SyncActivityEntry,
} from "@modules/firebase/syncActivityLog";
import { COLD_SYNC_INTERVAL_MS, HOT_SYNC_INTERVAL_MS } from "@modules/firebase/syncDebounceManager";
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

interface TimerTile {
    label: string;
    /** How often it runs, under the label. */
    hint: string;
    /** The countdown, or a short state ("na zywo", "brak zmian"). */
    value: string;
    /** Share of the interval still to wait (0..1) — drawn as a draining bar; null for no bar. */
    remaining: number | null;
    /** Nothing scheduled: the tile is dimmed. */
    idle?: boolean;
    /** Runs continuously: full bar in the success colour. */
    live?: boolean;
    /** The value is a running countdown (digits in monospace). */
    countdown?: boolean;
}

function countdownTile(label: string, hint: string, at: number | null, intervalMs: number, now: number): TimerTile {
    if (at === null) return { label, hint, value: 'brak zmian', remaining: null, idle: true };
    const left = Math.max(0, at - now);
    return { label, hint, value: formatCountdown(left), remaining: Math.min(1, left / intervalMs), countdown: true };
}

/** The sync timers as tiles; a single tile when sync isn't running here. */
function timerTiles(syncV2: boolean, now: number): TimerTile[] {
    if (!syncV2) {
        const { hot, cold } = syncEngine.getScheduledAutoSyncs();
        return [
            countdownTile('Ustawienia i dane', `${formatInterval(HOT_SYNC_INTERVAL_MS)} po zmianie`, hot, HOT_SYNC_INTERVAL_MS, now),
            countdownTile('Licznik zabitych, lokacje', `${formatInterval(COLD_SYNC_INTERVAL_MS)} po zmianie`, cold, COLD_SYNC_INTERVAL_MS, now),
        ];
    }
    const status = getSyncV2Status();
    switch (status.state) {
        case 'running': {
            const interval = status.uploadIntervalMs ?? 0;
            const upload = interval > 0
                ? countdownTile(
                    'Wysyłanie',
                    `co ${formatInterval(interval)}${status.watchedByOthers ? ' · inne urządzenie aktywne' : ''}`,
                    status.nextUploadAt,
                    interval,
                    now,
                )
                : { label: 'Wysyłanie', hint: '', value: 'brak', remaining: null, idle: true };
            return [
                upload,
                {
                    label: 'Odbieranie',
                    hint: 'gdy karta jest widoczna',
                    value: status.listening ? 'na żywo' : 'wstrzymane',
                    remaining: status.listening ? 1 : null,
                    idle: !status.listening,
                    live: status.listening,
                },
            ];
        }
        case 'waiting':
            return [countdownTile('Ponowna próba uruchomienia', `co ${formatInterval(60_000)}`, status.retryAt, 60_000, now)];
        case 'other-tab':
            return [{ label: 'Synchronizacja', hint: 'jedna karta synchronizuje za wszystkie', value: 'w innej karcie', remaining: null }];
        default:
            return [];
    }
}

interface SyncTimersProps {
    syncV2: boolean;
}

/** The scheduled syncs as a row of tiles, for the auto-sync box. */
export function SyncTimers({ syncV2 }: SyncTimersProps) {
    const tiles = timerTiles(syncV2, useNow());
    if (tiles.length === 0) return null;
    return (
        <div className="sync-timers">
            {tiles.map(tile => (
                <div key={tile.label} className={`sync-timer${tile.idle ? ' is-idle' : ''}${tile.live ? ' is-live' : ''}`}>
                    <div className="sync-timer__label">{tile.label}</div>
                    <div className={`sync-timer__value${tile.countdown ? ' is-countdown' : ''}`}>{tile.value}</div>
                    {tile.hint && <div className="sync-timer__hint">{tile.hint}</div>}
                    <div className="sync-timer__bar">
                        {tile.remaining !== null && (
                            <span style={{ width: `${Math.round(tile.remaining * 100)}%` }} />
                        )}
                    </div>
                </div>
            ))}
        </div>
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
                        Wyczyść
                    </Button>
                )}
            </div>
            <ul className="sync-log__list">
                {entries.length === 0 ? (
                    <li className="popup-muted">Brak wpisów w tej sesji.</li>
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
