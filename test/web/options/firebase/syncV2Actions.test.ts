const settings = { encryptionEnabled: false };
let passphrase: string | null = null;
const runSyncV2Action = vi.fn();

vi.mock("@modules/firebase", () => ({
    loadFirebaseSettings: () => settings,
    syncEngine: { getPassphrase: () => passphrase },
}));
vi.mock("@web/userData/syncV2", () => ({ runSyncV2Action: (...args: unknown[]) => runSyncV2Action(...args) }));

import {
    DOWNLOAD_WAIT_MS,
    inBackgroundAfter,
    redownloadV2,
    resetCloudV2,
    sendChangesV2,
    syncV2NotRunningMessage,
} from "@web/options/firebase/syncV2Actions.ts";

describe("syncV2Actions", () => {
    afterEach(() => {
        vi.useRealTimers();
        runSyncV2Action.mockReset();
        settings.encryptionEnabled = false;
        passphrase = null;
    });

    test("inBackgroundAfter returns the result when the work finishes in time", async () => {
        await expect(inBackgroundAfter(Promise.resolve(7), 1000)).resolves.toBe(7);
    });

    test("inBackgroundAfter returns 'background' once the time passes", async () => {
        vi.useFakeTimers();
        const info = vi.spyOn(console, "info").mockImplementation(() => {});
        let finish!: (value: number) => void;
        const outcome = inBackgroundAfter(new Promise<number>(resolve => { finish = resolve; }), 50);
        await vi.advanceTimersByTimeAsync(50);
        await expect(outcome).resolves.toBe("background");
        finish(1);
        await vi.runAllTimersAsync();
        expect(info).toHaveBeenCalledWith("[SyncV2] Download finished in the background");
        info.mockRestore();
    });

    test("the not-running message asks for the passphrase when encryption waits for it", () => {
        settings.encryptionEnabled = true;
        expect(syncV2NotRunningMessage()).toBe("Podaj hasło szyfrowania.");
        passphrase = "secret";
        expect(syncV2NotRunningMessage()).toContain("innej karcie");
    });

    test("sendChangesV2 reports success or that sync isn't running", async () => {
        runSyncV2Action.mockResolvedValueOnce(true);
        await expect(sendChangesV2()).resolves.toEqual({ status: "Zmiany zostały wysłane." });
        runSyncV2Action.mockResolvedValueOnce(false);
        await expect(sendChangesV2()).resolves.toEqual({ error: syncV2NotRunningMessage() });
    });

    test("redownloadV2 leaves a long download to the background", async () => {
        vi.useFakeTimers();
        vi.spyOn(console, "info").mockImplementation(() => {});
        runSyncV2Action.mockReturnValueOnce(new Promise(() => {}));
        const outcome = redownloadV2();
        await vi.advanceTimersByTimeAsync(DOWNLOAD_WAIT_MS);
        await expect(outcome).resolves.toEqual({
            status: "Pobieranie trwa dłużej niż zwykle - dane zostaną zastosowane w tle.",
        });
    });

    test("redownloadV2 and resetCloudV2 report a finished action", async () => {
        runSyncV2Action.mockResolvedValue(true);
        await expect(redownloadV2()).resolves.toEqual({ status: "Dane z chmury zostały pobrane." });
        await expect(resetCloudV2()).resolves.toEqual({
            status: "Dane zostały usunięte z chmury. To urządzenie wysłało ponownie swoje dane.",
        });
    });
});
