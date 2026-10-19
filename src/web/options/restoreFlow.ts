/** Confirmation and publishing around restoring a backup (file or Google Drive). */

import { flushSyncV2 } from "@web/userData/syncV2";
import { confirmDialog } from "@web-ui/primitives/confirmDialog.tsx";

/**
 * Restoring goes out to the other devices through sync: restored settings are
 * newer than theirs, and progress data (knowledge, kills, visited rooms) is
 * merged rather than replaced.
 */
export function confirmRestore(): Promise<boolean> {
    return confirmDialog({
        title: "Przywróć kopię",
        confirmLabel: "Przywróć",
        danger: true,
        message: "Przywrócenie kopii zastąpi ustawienia na wszystkich Twoich urządzeniach (dane postępów, np. wiedza "
        + "czy licznik zabitych, zostaną połączone). Kontynuować?",
    });
}

/** After a restore: send it to the other devices now rather than at the next sync. */
export async function publishRestore(): Promise<void> {
    await flushSyncV2().catch(error => console.error("Failed to upload restored data", error));
}
