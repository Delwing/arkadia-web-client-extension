import { act } from "react";
import eventBus from "@modules/core/eventBus";
jest.mock("@web-ui/components/panels/PackageStatus", () => ({
    __esModule: true,
    PackageStatus: () => null,
}));

import mountStatusIndicators from "../../src/web/statusIndicators";

jest.mock("@modules/core/storage", () => ({
    getItemSync: jest.fn(() => ({})),
}));
import { getItemSync } from "@modules/core/storage";

describe("AttackMode indicator", () => {
    let cleanup: ReturnType<typeof mountStatusIndicators> | undefined;
    let container: HTMLElement;

    beforeEach(() => {
        eventBus.clear();
        document.body.innerHTML = '<div id="status-indicators"></div>';
        (getItemSync as jest.Mock).mockReturnValue({ attack_mode: "A" });
        act(() => {
            cleanup = mountStatusIndicators();
        });
        container = document.getElementById("attack-mode")!;
    });

    afterEach(() => {
        act(() => {
            cleanup?.destroy();
        });
        eventBus.clear();
    });

    test("updates mode display", () => {
        act(() => {
            eventBus.emit("isTeamLeader", true);
        });
        const span = container.querySelector("span");
        expect(span).toBeTruthy();
        expect(span!.textContent).toBe("Atk: A");
        expect(span!.className).toBe("A");

        act(() => {
            eventBus.emit("attackMode", "AW");
        });
        const spanAfter = container.querySelector("span");
        expect(spanAfter!.textContent).toBe("Atk: AW");
        expect(spanAfter!.className).toBe("AW");
    });

    test("click cycles mode and emits event", () => {
        act(() => {
            eventBus.emit("isTeamLeader", true);
        });
        const emitSpy = jest.spyOn(eventBus, "emit");
        emitSpy.mockClear();

        let span = container.querySelector("span");
        expect(span).toBeTruthy();

        act(() => {
            span!.click();
        });
        expect(emitSpy).toHaveBeenLastCalledWith("attackMode", "AW");
        span = container.querySelector("span");
        expect(span!.textContent).toBe("Atk: AW");

        act(() => {
            span!.click();
        });
        expect(emitSpy).toHaveBeenLastCalledWith("attackMode", "AWR");
        span = container.querySelector("span");
        expect(span!.textContent).toBe("Atk: AWR");

        act(() => {
            span!.click();
        });
        expect(emitSpy).toHaveBeenLastCalledWith("attackMode", "A");
        span = container.querySelector("span");
        expect(span!.textContent).toBe("Atk: A");

        emitSpy.mockRestore();
    });

    test("hides when not leader", () => {
        act(() => {
            eventBus.emit("isTeamLeader", false);
        });
        let span = container.querySelector("span");
        expect(span).toBeNull();

        act(() => {
            eventBus.emit("isTeamLeader", true);
        });
        span = container.querySelector("span");
        expect(span).toBeTruthy();
        expect(span!.textContent).toBe("Atk: A");
    });
});
