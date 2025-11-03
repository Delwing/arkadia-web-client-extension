import { act } from "react";
import eventBus from "@client/src/eventBus.ts";
import mountStatusIndicators from "../src/statusIndicators";

jest.mock("@client/src/storage.ts", () => ({
    getItemSync: jest.fn(() => ({})),
}));
import { getItemSync } from "@client/src/storage.ts";

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
        expect(container.textContent).toBe("Atk: A");
        expect(container.style.display).toBe("block");
        expect(container.className).toBe("A");

        act(() => {
            eventBus.emit("attackMode", "AW");
        });
        expect(container.textContent).toBe("Atk: AW");
        expect(container.className).toBe("AW");
    });

    test("click cycles mode and emits event", () => {
        act(() => {
            eventBus.emit("isTeamLeader", true);
        });
        const emitSpy = jest.spyOn(eventBus, "emit");
        emitSpy.mockClear();

        act(() => {
            container.click();
        });
        expect(emitSpy).toHaveBeenLastCalledWith("attackMode", "AW");
        expect(container.textContent).toBe("Atk: AW");

        act(() => {
            container.click();
        });
        expect(emitSpy).toHaveBeenLastCalledWith("attackMode", "AWR");
        expect(container.textContent).toBe("Atk: AWR");

        act(() => {
            container.click();
        });
        expect(emitSpy).toHaveBeenLastCalledWith("attackMode", "A");
        expect(container.textContent).toBe("Atk: A");

        emitSpy.mockRestore();
    });

    test("hides when not leader", () => {
        act(() => {
            eventBus.emit("isTeamLeader", false);
        });
        expect(container.style.display).toBe("none");

        act(() => {
            eventBus.emit("isTeamLeader", true);
        });
        expect(container.style.display).toBe("block");
    });
});
