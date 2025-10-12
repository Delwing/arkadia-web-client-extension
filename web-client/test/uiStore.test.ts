import type { CommandDispatcher } from "@client/src/runtime/command-dispatcher";
import { resetUiStoreForTesting, uiStore } from "./utils/uiStoreTestUtils";

describe("ui store command dispatcher", () => {
    afterEach(() => {
        resetUiStoreForTesting();
    });

    test("forwards commands when dispatcher configured", async () => {
        const dispatcher: CommandDispatcher = {
            sendCommand: jest.fn(() => true),
            sendEvent: jest.fn(),
        };
        uiStore.getState().setCommandDispatcher(dispatcher);
        await uiStore.getState().dispatch({ type: "command/send", command: "say hello", echo: false });
        expect(dispatcher.sendCommand).toHaveBeenCalledWith("say hello", { echo: false });
    });

    test("forwards events when dispatcher configured", async () => {
        const dispatcher: CommandDispatcher = {
            sendCommand: jest.fn(() => true),
            sendEvent: jest.fn(),
        };
        uiStore.getState().setCommandDispatcher(dispatcher);
        await uiStore.getState().dispatch({ type: "event/send", event: "custom", payload: { foo: "bar" } });
        expect(dispatcher.sendEvent).toHaveBeenCalledWith("custom", { foo: "bar" });
    });

    test("throws when dispatcher missing", async () => {
        await expect(
            uiStore.getState().dispatch({ type: "command/send", command: "say" })
        ).rejects.toThrow("Command dispatcher not configured");
    });
});
