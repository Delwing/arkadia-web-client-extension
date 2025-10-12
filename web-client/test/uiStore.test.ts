import type { CommandDispatcher, ExtensionCommand } from "@client/src/runtime/command-dispatcher";
import { resetUiStoreForTesting, uiStore } from "./utils/uiStoreTestUtils";

describe("ui store command dispatcher", () => {
    afterEach(() => {
        resetUiStoreForTesting();
    });

    test("forwards extension commands when dispatcher configured", async () => {
        const dispatcher: CommandDispatcher = {
            sendCommand: jest.fn(() => true),
            sendEvent: jest.fn(),
            sendExtensionCommand: jest.fn<ReturnType<CommandDispatcher["sendExtensionCommand"]>, [ExtensionCommand]>(() => true),
        };
        uiStore.getState().setCommandDispatcher(dispatcher);
        await uiStore.getState().dispatch({ type: "extension/command", command: { type: "MULTIBINDS_LOAD" } });
        expect(dispatcher.sendExtensionCommand).toHaveBeenCalledWith({ type: "MULTIBINDS_LOAD" });
    });

    test("throws when dispatcher missing", async () => {
        await expect(
            uiStore.getState().dispatch({ type: "extension/command", command: { type: "MULTIBINDS_LOAD" } })
        ).rejects.toThrow("Command dispatcher not configured");
    });
});
