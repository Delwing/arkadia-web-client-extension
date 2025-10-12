 (window as any).Input = { send: jest.fn() };
 (window as any).Output = { send: jest.fn(), flush_buffer: jest.fn(), buffer: [] };
 (window as any).Text = { parse_patterns: jest.fn((value: unknown) => value) };
 (window as any).Maps = {
    refresh_position: jest.fn(),
    set_position: jest.fn(),
    unset_position: jest.fn(),
    data: undefined,
};
 (window as any).Gmcp = { parse_option_subnegotiation: jest.fn() };

jest.mock("../../src/main", () => ({
    __esModule: true,
    rawInputSend: jest.fn((cmd: string) => (window as any).Input.send(cmd)),
    rawOutputSend: jest.fn(),
}));

jest.mock("../../src/Triggers", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        parseLine: jest.fn((line: string) => line),
        parseMultiline: jest.fn((line: string) => line),
    })),
}));

jest.mock("../../src/PackageHelper", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../src/OutputHandler", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../src/scripts/functionalBind", () => ({
    FunctionalBind: jest.fn().mockImplementation(() => ({
        set: jest.fn(),
        clear: jest.fn(),
        newMessage: jest.fn(),
    })),
}));

jest.mock("../../src/MapHelper", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        parseCommand: jest.fn((command: string) => command),
        move: jest.fn(() => ({ direction: "", moved: false })),
        setBlockable: jest.fn(),
    })),
}));

jest.mock("howler", () => {
    const instance = {
        state: jest.fn(() => "loaded"),
        play: jest.fn(),
        stop: jest.fn(),
        once: jest.fn(),
        load: jest.fn(),
    };
    return { Howl: jest.fn(() => instance) };
});

import Client, { type ClientAdapter } from "../../src/Client";
import { EventHub, type RuntimeEvents } from "../../src/runtime/event-hub";

describe("Client runtime event subscriptions", () => {
    let client: Client;
    let eventHub: EventHub<RuntimeEvents>;

    beforeEach(() => {
        eventHub = new EventHub<RuntimeEvents>();
        const adapter: ClientAdapter = {
            send: jest.fn(),
            output: jest.fn(),
            sendGmcp: jest.fn(),
            parseAnsiPatterns: jest.fn((text: string) => text),
            flushMessageBuffer: jest.fn(),
        };
        const port = { onMessage: { addListener: jest.fn() }, postMessage: jest.fn() };
        client = new Client(adapter, port, eventHub);
    });

    test("re-dispatches gmcp updates", () => {
        const gmcpEvents: { path: string; value: unknown }[] = [];
        const roomInfo: unknown[] = [];

        client.addEventListener("gmcp", (event: Event) => {
            gmcpEvents.push((event as CustomEvent<{ path: string; value: unknown }>).detail);
        });
        client.addEventListener("gmcp.room.info", (event: Event) => {
            roomInfo.push((event as CustomEvent).detail);
        });

        const payload = { id: 5 };
        eventHub.emit("gmcp", { path: "room.info", value: payload });

        expect(gmcpEvents).toEqual([{ path: "room.info", value: payload }]);
        expect(roomInfo).toEqual([payload]);
    });

    test("re-dispatches gmcp message updates", () => {
        const gmcpMessages: string[] = [];
        client.addEventListener("gmcp_msg.room.exits", (event: Event) => {
            gmcpMessages.push((event as CustomEvent<string>).detail);
        });

        eventHub.emit("gmcpMessage", { type: "room.exits", text: "north" });

        expect(gmcpMessages).toEqual(["north"]);
    });

    test("re-dispatches output and command events", () => {
        const counts: number[] = [];
        const commands: string[] = [];
        let lineSent = 0;

        client.addEventListener("output-sent", (event: Event) => {
            counts.push((event as CustomEvent<number>).detail);
        });
        client.addEventListener("command", (event: Event) => {
            commands.push((event as CustomEvent<string>).detail);
        });
        client.addEventListener("line-sent", () => {
            lineSent += 1;
        });

        eventHub.emit("outputFlushed", { count: 3 });
        eventHub.emit("command", "look");
        eventHub.emit("lineSent", { type: "plain" });

        expect(counts).toEqual([3]);
        expect(commands).toEqual(["look"]);
        expect(lineSent).toBe(1);
    });
});
