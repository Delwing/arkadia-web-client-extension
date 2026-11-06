/**
 * The sync tab's actions on the v1 single-document sync. Goes with the rest of
 * `firebase/v1/` when v1 is removed (`docs/dev/SYNC_V2_PLAN.md`, stage 5b).
 */
import {
    type SyncCategory,
    SYNC_CATEGORIES,
    FIREBASE_ERRORS,
    uploadCategories,
    downloadCategories,
    getAllCategoriesMetadata,
    recordCategorySyncState,
    deleteAllCategories,
    syncEngine,
} from "@modules/firebase";
import { importCategories } from "@web/options/export/index.ts";
import type { SyncOutcome } from "../syncOutcome";

/** What the v1 cloud document holds, per category. */
export type CloudMetadata = Partial<Record<SyncCategory, {
    exists: boolean;
    syncedAt?: string;
    deviceId?: string;
    encrypted?: boolean;
}>>;

/**
 * Manual "send to cloud". The engine performs the actual work; success,
 * conflicts and errors come back through the eventBus (see `useSyncV1`).
 */
export async function sendChangesV1(): Promise<SyncOutcome> {
    const result = await syncEngine.syncNow(false);
    if (result.status === 'skipped') {
        if (result.reason === 'needs-passphrase') {
            return { error: 'Podaj hasło szyfrowania.' };
        } else if (result.reason === 'no-data') {
            return { status: 'Brak danych do wysłania.' };
        }
    } else if (result.status === 'in-sync') {
        return { status: 'Wszystkie dane są aktualne.' };
    }
    return {};
}

/** Downloads and imports `categories`; `imported` when local data changed. */
export async function downloadV1(
    categories: SyncCategory[] | undefined,
    passphrase: string | undefined,
): Promise<SyncOutcome & { imported?: boolean }> {
    // Get categories to download
    const categoriesToDownload = categories ?? SYNC_CATEGORIES;

    const result = await downloadCategories(categoriesToDownload, passphrase);

    if (!result.success) {
        const firstError = Object.values(result.errors)[0];
        return { error: firstError ?? FIREBASE_ERRORS.SYNC_FAILED };
    }

    if (Object.keys(result.data).length === 0) {
        return { status: 'Brak danych w chmurze.' };
    }

    // Import downloaded categories
    // (downloadCategories already returns per-device data for device-scoped categories)
    const importResult = await importCategories(result.data);
    if (!importResult.success) {
        const firstError = Object.values(importResult.errors)[0];
        return { error: firstError ?? 'Import nie powiódł się.' };
    }

    // The downloaded cloud state is the new sync base for these categories
    const baseChecksums: Partial<Record<SyncCategory, string>> = {};
    Object.keys(result.data).forEach(cat => {
        const payload = result.payloads[cat as SyncCategory];
        if (payload) baseChecksums[cat as SyncCategory] = payload.checksum;
    });
    recordCategorySyncState(baseChecksums);

    return {
        status: 'Dane zostały pobrane z chmury. Niektóre ustawienia mogą wymagać odświeżenia strony.',
        imported: true,
    };
}

/** Deletes the v1 document; `cleared` when the cloud is now empty. */
export async function deleteCloudDataV1(): Promise<SyncOutcome & { cleared?: boolean }> {
    const result = await deleteAllCategories();

    if (!result.success) {
        const firstError = Object.values(result.errors)[0];
        return { error: firstError ?? FIREBASE_ERRORS.SYNC_FAILED };
    }

    return { status: 'Dane zostały usunięte z chmury.', cleared: true };
}

/** Decrypts the cloud's encrypted categories with `passphrase` and stores them unencrypted. */
export async function disableEncryptionV1(cloudMetadata: CloudMetadata, passphrase: string): Promise<SyncOutcome> {
    // Get encrypted categories
    const encryptedCategories = SYNC_CATEGORIES.filter(cat => cloudMetadata[cat]?.encrypted);

    // Download and decrypt with current passphrase
    const result = await downloadCategories(encryptedCategories, passphrase);
    if (!result.success) {
        const firstError = Object.values(result.errors)[0];
        return { error: firstError ?? FIREBASE_ERRORS.DECRYPTION_FAILED };
    }
    if (Object.keys(result.data).length === 0) {
        return { error: 'Brak danych w chmurze.' };
    }
    // Re-upload without encryption. Force: this rewrites the
    // cloud's own data deliberately, the conflict check must
    // not block it.
    const uploadResult = await uploadCategories(result.data, {
        encrypted: false,
        force: true,
    });
    if (!uploadResult.success) {
        const firstError = Object.values(uploadResult.errors)[0];
        return { error: firstError ?? FIREBASE_ERRORS.SYNC_FAILED };
    }
    return { status: 'Szyfrowanie zostało wyłączone. Dane zapisane bez szyfrowania.' };
}

/** The cloud metadata read afresh, or null when it can't be read. */
export async function readCloudMetadataV1(): Promise<CloudMetadata | null> {
    const metadata = await getAllCategoriesMetadata();
    return metadata.error ? null : metadata.categories;
}
