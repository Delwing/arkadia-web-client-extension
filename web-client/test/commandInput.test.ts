import type { CommandDispatcher } from "@client/src/runtime/command-dispatcher";

import { sendMessageFromInput, type CommandHistoryState } from "../src/commandInput";

describe("sendMessageFromInput", () => {
    let dispatcher: jest.Mocked<CommandDispatcher>;
    let arkadiaClient: { hasReceivedFirstGmcp: jest.Mock<boolean, []> };
    let history: CommandHistoryState;
    let input: HTMLInputElement;

    beforeEach(() => {
        dispatcher = {
            sendCommand: jest.fn(() => true),
            sendEvent: jest.fn(),
            sendExtensionCommand: jest.fn(() => false),
        } as unknown as jest.Mocked<CommandDispatcher>;
        arkadiaClient = { hasReceivedFirstGmcp: jest.fn(() => true) };
        history = { history: [], index: -1, currentInput: "" };
        input = document.createElement("input");
        jest.spyOn(input, "select").mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("dispatches command and records it in history", () => {
        input.value = "look";

        sendMessageFromInput(input, { dispatcher, arkadiaClient: arkadiaClient as any, history });

        expect(dispatcher.sendCommand).toHaveBeenCalledWith("look");
        expect(history.history).toEqual(["look"]);
        expect(history.index).toBe(-1);
        expect(history.currentInput).toBe("");
        expect(input.select).toHaveBeenCalled();
    });

    test("does not alter history when dispatcher rejects command", () => {
        dispatcher.sendCommand.mockReturnValue(false);
        input.value = "look";

        sendMessageFromInput(input, { dispatcher, arkadiaClient: arkadiaClient as any, history });

        expect(dispatcher.sendCommand).toHaveBeenCalledWith("look");
        expect(history.history).toHaveLength(0);
        expect(history.index).toBe(-1);
        expect(input.select).not.toHaveBeenCalled();
    });

    test("clears input when GMCP handshake not complete", () => {
        arkadiaClient.hasReceivedFirstGmcp.mockReturnValue(false);
        input.value = "look";

        sendMessageFromInput(input, { dispatcher, arkadiaClient: arkadiaClient as any, history });

        expect(dispatcher.sendCommand).toHaveBeenCalledWith("look");
        expect(input.value).toBe("");
        expect(history.history).toHaveLength(0);
        expect(input.select).not.toHaveBeenCalled();
    });

    test("dispatches blank command without modifying history", () => {
        input.value = "   ";

        sendMessageFromInput(input, { dispatcher, arkadiaClient: arkadiaClient as any, history });

        expect(dispatcher.sendCommand).toHaveBeenCalledWith("");
        expect(history.history).toHaveLength(0);
        expect(history.index).toBe(-1);
        expect(input.select).toHaveBeenCalled();
    });

    test("respects focus flag when dispatching blank command", () => {
        input.value = "";

        sendMessageFromInput(input, { dispatcher, arkadiaClient: arkadiaClient as any, history }, false);

        expect(dispatcher.sendCommand).toHaveBeenCalledWith("");
        expect(input.select).not.toHaveBeenCalled();
    });
});
