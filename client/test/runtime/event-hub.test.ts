describe("runtimeEventHub singleton", () => {
    afterEach(() => {
        jest.resetModules();
    });

    it("does not leak the event hub onto the global scope", () => {
        jest.isolateModules(() => {
            require("../../src/runtime/event-hub");

            expect((globalThis as { runtimeEventHub?: unknown }).runtimeEventHub).toBeUndefined();
        });
    });

    it("returns the same instance for repeated imports", () => {
        const first = require("../../src/runtime/event-hub");
        const second = require("../../src/runtime/event-hub");

        expect(second.runtimeEventHub).toBe(first.runtimeEventHub);
    });
});
