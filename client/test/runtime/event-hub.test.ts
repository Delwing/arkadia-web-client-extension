describe("runtimeEventHub global reuse", () => {
    afterEach(() => {
        delete (globalThis as { runtimeEventHub?: unknown }).runtimeEventHub;
        jest.resetModules();
    });

    it("registers the runtime event hub on the global scope", () => {
        jest.isolateModules(() => {
            const { runtimeEventHub } = require("../../src/runtime/event-hub");

            expect((globalThis as { runtimeEventHub?: unknown }).runtimeEventHub).toBe(runtimeEventHub);
        });
    });

    it("reuses an existing global runtime event hub", () => {
        const { EventHub } = jest.requireActual<typeof import("../../src/runtime/event-hub")>(
            "../../src/runtime/event-hub",
        );
        const existingEventHub = new EventHub();

        (globalThis as { runtimeEventHub?: unknown }).runtimeEventHub = existingEventHub;
        jest.resetModules();

        jest.isolateModules(() => {
            const { runtimeEventHub } = require("../../src/runtime/event-hub");

            expect(runtimeEventHub).toBe(existingEventHub);
        });
    });
});
