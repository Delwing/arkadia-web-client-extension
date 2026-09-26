import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearSyncActivity, logSyncActivity } from "@modules/firebase/syncActivityLog";

const status = { state: 'stopped', nextUploadAt: null as number | null, retryAt: null as number | null, watchedByOthers: false };

vi.mock("@web/userData/syncV2", () => ({ getSyncV2Status: () => status }));
vi.mock("@modules/firebase", () => ({ syncEngine: { getNextAutoSyncAt: () => null } }));

import SyncActivityPanel from "@web/options/SyncActivityPanel";

describe("SyncActivityPanel", () => {
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
        status.state = 'stopped';
        status.nextUploadAt = null;
    });

    test("shows new entries newest first", () => {
        act(() => root.render(<SyncActivityPanel syncV2 />));
        expect(container.textContent).toContain("Brak wpisow");

        act(() => {
            logSyncActivity("info", "Synchronizacja uruchomiona.");
            logSyncActivity("success", "Wyslano zmiany: 2 (aliases×2)");
        });
        const items = [...container.querySelectorAll(".sync-activity__entry")].map(li => li.textContent);
        expect(items).toHaveLength(2);
        expect(items[0]).toContain("Wyslano zmiany");
        expect(container.querySelector(".popup-text-success")?.textContent).toBe("Wyslano zmiany: 2 (aliases×2)");
    });

    test("counts down to the next upload while running", () => {
        status.state = 'running';
        status.nextUploadAt = Date.now() + 245_000;
        act(() => root.render(<SyncActivityPanel syncV2 />));
        expect(container.textContent).toMatch(/Nastepne wysylanie za 4:0[45]/);
    });

    test("shows no countdown when nothing is pending", () => {
        act(() => root.render(<SyncActivityPanel syncV2 />));
        expect(container.textContent).not.toContain(" za ");
    });
});
