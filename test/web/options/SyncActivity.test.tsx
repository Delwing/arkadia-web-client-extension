import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearSyncActivity, logSyncActivity } from "@modules/firebase/syncActivityLog";

const status = {
    state: 'stopped',
    nextUploadAt: null as number | null,
    uploadIntervalMs: null as number | null,
    retryAt: null as number | null,
    watchedByOthers: false,
};
const scheduled = { hot: null as number | null, cold: null as number | null };

vi.mock("@web/userData/syncV2", () => ({ getSyncV2Status: () => status }));
vi.mock("@modules/firebase", () => ({ syncEngine: { getScheduledAutoSyncs: () => scheduled } }));

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
        Object.assign(status, { state: 'stopped', nextUploadAt: null, uploadIntervalMs: null, watchedByOthers: false });
        Object.assign(scheduled, { hot: null, cold: null });
    });

    const rows = () => [...container.querySelectorAll(".sync-timers__row")].map(li => li.textContent);

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

    test("counts down to the next upload with its interval (sync v2)", () => {
        Object.assign(status, { state: 'running', nextUploadAt: Date.now() + 245_000, uploadIntervalMs: 300_000 });
        act(() => root.render(<SyncTimers syncV2 />));
        expect(rows()).toHaveLength(1);
        expect(rows()[0]).toMatch(/Wysylanie\s*za 4:0[45] \(co 5 min\)/);
    });

    test("shows the hot and the cold timer separately (sync v1)", () => {
        const now = Date.now();
        Object.assign(scheduled, { hot: now + 25_000, cold: now + 492_000 });
        act(() => root.render(<SyncTimers syncV2={false} />));
        expect(rows()).toHaveLength(2);
        expect(rows()[0]).toMatch(/Ustawienia i dane\s*za 0:2[45]/);
        expect(rows()[1]).toMatch(/Licznik zabitych, odwiedzone lokacje\s*za 8:1[12]/);
    });

    test("renders no timers when nothing is pending", () => {
        act(() => root.render(<SyncTimers syncV2={false} />));
        expect(container.querySelector(".sync-timers")).toBeNull();
        act(() => root.render(<SyncTimers syncV2 />));
        expect(container.querySelector(".sync-timers")).toBeNull();
    });
});
