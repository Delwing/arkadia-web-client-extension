import { loadFirebaseSettings, syncEngine } from "@modules/firebase";
import { runSyncV2Action } from "@web/userData/syncV2";
import type { SyncOutcome } from "./syncOutcome";

/** How long the download button waits before leaving a large download to finish in the background. */
export const DOWNLOAD_WAIT_MS = 60_000;

/**
 * `work`'s result, or 'background' once `ms` pass: the work goes on and its
 * outcome is only logged, so a long apply doesn't hold the button.
 */
export function inBackgroundAfter<T>(work: Promise<T>, ms: number): Promise<T | 'background'> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'background'>(resolve => {
        timer = setTimeout(() => {
            work.then(
                () => console.info('[SyncV2] Download finished in the background'),
                error => console.error('[SyncV2] Download failed in the background', error),
            );
            resolve('background');
        }, ms);
    });
    return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** Why sync v2 isn't running in this tab, for the send / download buttons. */
export function syncV2NotRunningMessage(): string {
    const settings = loadFirebaseSettings();
    if (settings.encryptionEnabled && !syncEngine.getPassphrase()) return 'Podaj hasło szyfrowania.';
    return 'Synchronizacja działa w innej karcie tej przeglądarki albo nie mogła się uruchomić (sprawdź połączenie).';
}

/** "Send to cloud": a one-off flush, which runs even with auto-sync off. */
export async function sendChangesV2(): Promise<SyncOutcome> {
    if (!(await runSyncV2Action(engine => engine.flush()))) {
        return { error: syncV2NotRunningMessage() };
    }
    return { status: 'Zmiany zostały wysłane.' };
}

/** "Download from cloud": everything again, left to finish in the background if it takes long. */
export async function redownloadV2(): Promise<SyncOutcome> {
    const outcome = await inBackgroundAfter(
        runSyncV2Action(engine => engine.redownload()),
        DOWNLOAD_WAIT_MS,
    );
    if (outcome === 'background') {
        return { status: 'Pobieranie trwa dłużej niż zwykle - dane zostaną zastosowane w tle.' };
    }
    if (!outcome) return { error: syncV2NotRunningMessage() };
    return { status: 'Dane z chmury zostały pobrane.' };
}

/**
 * "Delete cloud data". The v1 document stays until v1 is removed: it is the
 * way back if sync v2 has to be switched off.
 */
export async function resetCloudV2(): Promise<SyncOutcome> {
    if (!(await runSyncV2Action(engine => engine.resetCloud()))) {
        return { error: syncV2NotRunningMessage() };
    }
    return { status: 'Dane zostały usunięte z chmury. To urządzenie wysłało ponownie swoje dane.' };
}
