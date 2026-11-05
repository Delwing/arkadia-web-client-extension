import type { BackupPayload } from './backup';
import type { ExportPayload } from './legacyBackup';

/** Validates a legacy (version 1) backup file. */
export function validatePayload(input: unknown): input is ExportPayload {
    if (!input || typeof input !== "object") return false;
    const payload = input as Record<string, unknown>;
    if (payload.version !== 1) return false;
    if (typeof payload.createdAt !== "string") return false;
    if (!payload.localStorage || typeof payload.localStorage !== "object") return false;
    return !(!payload.indexedDB || typeof payload.indexedDB !== "object");
}

/** Validates a current (version 2) backup file. */
export function isBackupPayload(input: unknown): input is BackupPayload {
    if (!input || typeof input !== "object") return false;
    const payload = input as Record<string, unknown>;
    if (payload.version !== 2) return false;
    if (typeof payload.createdAt !== "string") return false;
    if (!payload.categories || typeof payload.categories !== "object") return false;
    const device = payload.device as Record<string, unknown> | undefined;
    return !!device && typeof device === "object" && !!device.sourceDevice && typeof device.sourceDevice === "object";
}

/** True for any backup file this version can restore (current or legacy format). */
export function isRestorableBackup(input: unknown): input is BackupPayload | ExportPayload {
    return isBackupPayload(input) || validatePayload(input);
}
