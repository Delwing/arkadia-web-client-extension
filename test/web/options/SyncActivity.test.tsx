import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearSyncActivity, logSyncActivity } from "@modules/firebase/syncActivityLog";

const status = {
    state: 'stopped',
    nextUploadAt: null as number | null,
    uploadIntervalMs: null as number | null,
    retryAt: null as number | null,
    watchedByOthers: false,
    listening: false,
};
const scheduled = { hot: null as number | null, cold: null as number | null };

vi.mock("@web/userData/syncV2", () => ({ getSyncV2Status: () => status }));
vi.mock("@modules/firebase", () => ({ syncEngine: { getScheduledAutoSyncs: () => scheduled } }));
vi.mock("@modules/firebase/syncDebounceManager", () => ({ HOT_SYNC_INTERVAL_MS: 30_000, COLD_SYNC_INTERVAL_MS: 600_000 }));

import { SyncActivityLog, SyncTimers } from "@web/options/SyncActivity";

describe("SyncActivity", () => {
    let container: HTMLElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        clearSyncActivity();
        Object.assign(status, { state: 'stopped', nextUploadAt: null, uploadIntervalMs: null, watchedByOthers: false, listening: false });
        Object.assign(scheduled, { hot: null, cold: null });
    });

    const tiles = () => [...container.querySelectorAll(".sync-timer")].map(tile => ({
        label: tile.querySelector(".sync-timer__label")?.textContent,
        value: tile.querySelector(".sync-timer__value")?.textContent,
        hint: tile.querySelector(".sync-timer__hint")?.textContent,
        bar: (tile.querySelector(".sync-timer__bar > span") as HTMLElement | null)?.style.width ?? null,
        className: tile.className,
    }));

    test("log shows new entries newest first", () => {
        act(() => root.render(<SyncActivityLog />));
        expect(container.textContent).toContain("Brak wpisow");

        act(() => {
            logSyncActivity("info", "Synchronizacja uruchomiona.");
            logSyncActivity("success", "Wyslano zmiany: 2 (aliases×2)");
        });
        const items = [...container.querySelectorAll(".sync-log__entry")].map(li => li.textContent);
        expect(items).toHaveLength(2);
        expect(items[0]).toContain("Wyslano zmiany");
        expect(container.querySelector(".popup-text-success")?.textContent).toBe("Wyslano zmiany: 2 (aliases×2)");
    });

    test("sync v2: an upload countdown with its interval and live receiving", () => {
        Object.assign(status, {
            state: 'running', nextUploadAt: Date.now() + 225_000, uploadIntervalMs: 300_000, listening: true,
        });
        act(() => root.render(<SyncTimers syncV2 />));
        const [upload, receive] = tiles();
        expect(upload.label).toBe("Wysylanie");
        expect(upload.value).toMatch(/^3:4[45]$/);
        expect(upload.hint).toBe("co 5 min");
        expect(upload.bar).toMatch(/^7[45]%$/);
        expect(receive).toMatchObject({ label: "Odbieranie", value: "na zywo", bar: "100%" });
        expect(receive.className).toContain("is-live");
    });

    test("sync v2: notes the faster interval while another device is active", () => {
        Object.assign(status, {
            state: 'running', nextUploadAt: Date.now() + 9_000, uploadIntervalMs: 15_000, watchedByOthers: true,
        });
        act(() => root.render(<SyncTimers syncV2 />));
        expect(tiles()[0].hint).toBe("co 15 s · inne urzadzenie aktywne");
        expect(tiles()[1]).toMatchObject({ value: "wstrzymane", bar: null });
    });

    test("sync v1: both timers, an idle one dimmed", () => {
        Object.assign(scheduled, { hot: Date.now() + 25_000, cold: null });
        act(() => root.render(<SyncTimers syncV2={false} />));
        const [hot, cold] = tiles();
        expect(hot).toMatchObject({ label: "Ustawienia i dane", hint: "30 s po zmianie" });
        expect(hot.value).toMatch(/^0:2[45]$/);
        expect(cold).toMatchObject({ label: "Licznik zabitych, lokacje", value: "brak zmian", hint: "10 min po zmianie", bar: null });
        expect(cold.className).toContain("is-idle");
    });

    test("another tab syncs: one tile says so", () => {
        status.state = 'other-tab';
        act(() => root.render(<SyncTimers syncV2 />));
        expect(tiles()).toMatchObject([{ label: "Synchronizacja", value: "w innej karcie" }]);
    });

    test("renders nothing while sync is stopped", () => {
        act(() => root.render(<SyncTimers syncV2 />));
        expect(container.querySelector(".sync-timers")).toBeNull();
    });
});
