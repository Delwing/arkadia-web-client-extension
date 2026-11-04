const syncNow = vi.fn();
const downloadCategories = vi.fn();
const uploadCategories = vi.fn();
const deleteAllCategories = vi.fn();
const getAllCategoriesMetadata = vi.fn();
const recordCategorySyncState = vi.fn();
const importCategories = vi.fn();

vi.mock("@modules/firebase", () => ({
    SYNC_CATEGORIES: ["aliases", "triggers"],
    FIREBASE_ERRORS: { SYNC_FAILED: "sync failed", DECRYPTION_FAILED: "decryption failed" },
    syncEngine: { syncNow: (...args: unknown[]) => syncNow(...args) },
    downloadCategories: (...args: unknown[]) => downloadCategories(...args),
    uploadCategories: (...args: unknown[]) => uploadCategories(...args),
    deleteAllCategories: () => deleteAllCategories(),
    getAllCategoriesMetadata: () => getAllCategoriesMetadata(),
    recordCategorySyncState: (...args: unknown[]) => recordCategorySyncState(...args),
}));
vi.mock("@web/options/exportUtils.ts", () => ({ importCategories: (...args: unknown[]) => importCategories(...args) }));

import {
    deleteCloudDataV1,
    disableEncryptionV1,
    downloadV1,
    readCloudMetadataV1,
    sendChangesV1,
} from "@web/options/firebase/v1/syncV1Actions.ts";

describe("syncV1Actions", () => {
    afterEach(() => vi.clearAllMocks());

    test.each([
        [{ status: "skipped", reason: "needs-passphrase" }, { error: "Podaj hasło szyfrowania." }],
        [{ status: "skipped", reason: "no-data" }, { status: "Brak danych do wysłania." }],
        [{ status: "in-sync" }, { status: "Wszystkie dane są aktualne." }],
        [{ status: "uploaded" }, {}],
    ])("sendChangesV1 maps %o", async (result, outcome) => {
        syncNow.mockResolvedValueOnce(result);
        await expect(sendChangesV1()).resolves.toEqual(outcome);
        expect(syncNow).toHaveBeenCalledWith(false);
    });

    test("downloadV1 imports the data and records the new sync base", async () => {
        downloadCategories.mockResolvedValueOnce({
            success: true,
            errors: {},
            data: { aliases: "{}" },
            payloads: { aliases: { checksum: "abc" } },
        });
        importCategories.mockResolvedValueOnce({ success: true, errors: {} });
        const outcome = await downloadV1(undefined, "pass");
        expect(downloadCategories).toHaveBeenCalledWith(["aliases", "triggers"], "pass");
        expect(recordCategorySyncState).toHaveBeenCalledWith({ aliases: "abc" });
        expect(outcome).toMatchObject({ imported: true });
    });

    test("downloadV1 reports an empty cloud and download errors", async () => {
        downloadCategories.mockResolvedValueOnce({ success: true, errors: {}, data: {}, payloads: {} });
        await expect(downloadV1(["aliases"], undefined)).resolves.toEqual({ status: "Brak danych w chmurze." });
        downloadCategories.mockResolvedValueOnce({ success: false, errors: {}, data: {}, payloads: {} });
        await expect(downloadV1(["aliases"], undefined)).resolves.toEqual({ error: "sync failed" });
        expect(importCategories).not.toHaveBeenCalled();
    });

    test("deleteCloudDataV1 clears the cloud or passes the first error on", async () => {
        deleteAllCategories.mockResolvedValueOnce({ success: true, errors: {} });
        await expect(deleteCloudDataV1()).resolves.toEqual({ status: "Dane zostały usunięte z chmury.", cleared: true });
        deleteAllCategories.mockResolvedValueOnce({ success: false, errors: { aliases: "nope" } });
        await expect(deleteCloudDataV1()).resolves.toEqual({ error: "nope" });
    });

    test("disableEncryptionV1 re-uploads only the encrypted categories, unencrypted", async () => {
        downloadCategories.mockResolvedValueOnce({ success: true, errors: {}, data: { triggers: "[]" } });
        uploadCategories.mockResolvedValueOnce({ success: true, errors: {} });
        const outcome = await disableEncryptionV1({ triggers: { exists: true, encrypted: true }, aliases: { exists: true } }, "pass");
        expect(downloadCategories).toHaveBeenCalledWith(["triggers"], "pass");
        expect(uploadCategories).toHaveBeenCalledWith({ triggers: "[]" }, { encrypted: false, force: true });
        expect(outcome.status).toContain("Szyfrowanie zostało wyłączone");
    });

    test("readCloudMetadataV1 is null when the metadata can't be read", async () => {
        getAllCategoriesMetadata.mockResolvedValueOnce({ error: "x", categories: {} });
        await expect(readCloudMetadataV1()).resolves.toBeNull();
        getAllCategoriesMetadata.mockResolvedValueOnce({ categories: { aliases: { exists: true } } });
        await expect(readCloudMetadataV1()).resolves.toEqual({ aliases: { exists: true } });
    });
});
