import { act } from "react";
import eventBus from "@modules/core/eventBus";
vi.mock("@web-ui/components/panels/PackageStatus", () => ({
    __esModule: true,
    PackageStatus: () => null,
}));

import mountStatusIndicators from "../../src/web/statusIndicators";

vi.mock("@modules/core/storage", () => {
    const store: Record<string, any> = {};
    const listeners = new Map<string, Set<Function>>();
    const typedStorage = {
        get: jest.fn((key: string) => store[key]),
        set: jest.fn((key: string, value: any) => { store[key] = value; }),
        onChange: jest.fn((key: string, listener: Function) => {
            if (!listeners.has(key)) listeners.set(key, new Set());
            listeners.get(key)!.add(listener);
            return () => listeners.get(key)!.delete(listener);
        }),
        fireListeners: jest.fn(),
        handleStorageEvent: jest.fn(),
        getCharacter: jest.fn(() => null),
        setCharacter: jest.fn(),
    };
    return {
        __esModule: true,
        characterStorage: typedStorage,
        globalStorage: typedStorage,
    };
});
import { characterStorage } from "@modules/core/storage";

describe("AttackMode indicator", () => {
    let cleanup: ReturnType<typeof mountStatusIndicators> | undefined;
    let container: HTMLElement;

    beforeEach(() => {
        eventBus.clear();
        document.body.innerHTML = '<div id="status-indicators"></div>';
        (characterStorage.get as jest.Mock).mockImplementation((key: string) => {
            if (key === 'attack_mode') return 'A';
            return undefined;
        });
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
        expect(container.style.display).toBe("inline");
        expect(container.textContent).toBe("Atk: A");
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

        expect(container.style.display).toBe("inline");

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
        expect(container.textContent).toBe("");

        act(() => {
            eventBus.emit("isTeamLeader", true);
        });
        expect(container.style.display).toBe("inline");
        expect(container.textContent).toBe("Atk: A");
    });
});
