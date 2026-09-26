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

function formatTime(at: number): string {
    return new Date(at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** What is scheduled next, or null when nothing is pending. */
function pendingText(syncV2: boolean, now: number): string | null {
    if (!syncV2) {
        const at = syncEngine.getNextAutoSyncAt();
        return at === null ? null : `Oczekujaca synchronizacja za ${formatCountdown(at - now)}`;
    }
    const status = getSyncV2Status();
    switch (status.state) {
        case 'running':
            if (status.nextUploadAt === null) return null;
            return `Nastepne wysylanie za ${formatCountdown(status.nextUploadAt - now)}`
                + (status.watchedByOthers ? ' (inne urzadzenie jest aktywne)' : '');
        case 'waiting':
            return status.retryAt === null ? null : `Ponowna proba uruchomienia za ${formatCountdown(status.retryAt - now)}`;
        case 'other-tab':
            return 'Synchronizacja dziala w innej karcie tej przegladarki.';
        default:
            return null;
    }
}

interface SyncActivityPanelProps {
    syncV2: boolean;
}

/** The sync page's activity log with the countdown to the next scheduled sync. */
function SyncActivityPanel({ syncV2 }: SyncActivityPanelProps) {
    const [entries, setEntries] = useState(getSyncActivity);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => onSyncActivity(setEntries), []);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const pending = pendingText(syncV2, now);

    return (
        <section className="character-settings-section sync-activity">
            <div className="firebase-sync__bar">
                <h5 className="character-settings-section-title">Dziennik synchronizacji</h5>
                {entries.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={clearSyncActivity}>
                        Wyczysc
                    </Button>
                )}
            </div>
            {pending && (
                <div className="popup-small">{pending}</div>
            )}
            {entries.length === 0 ? (
                <div className="popup-muted popup-small">Brak wpisow w tej sesji.</div>
            ) : (
                <ul className="sync-activity__list">
                    {[...entries].reverse().map(entry => (
                        <li key={entry.id} className="sync-activity__entry popup-small">
                            <span className="popup-muted sync-activity__time">{formatTime(entry.at)}</span>
                            <span className={LEVEL_CLASS[entry.level]}>{entry.text}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default SyncActivityPanel;
