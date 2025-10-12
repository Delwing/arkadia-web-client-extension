import MessageRouter from "../../src/runtime/transport/message-router";
import { EventHub, type RuntimeEvents } from "../../src/runtime/event-hub";
import MockTransportAdapter from "../../src/runtime/transport/mock-adapter";

describe("MessageRouter runtime event hub integration", () => {
    let eventHub: EventHub<RuntimeEvents>;
    let router: MessageRouter;

    beforeEach(() => {
        eventHub = new EventHub<RuntimeEvents>();
        router = new MessageRouter(new MockTransportAdapter({ emitLifecycle: false }), eventHub, {
            parseAnsiPatterns: (text) => text,
            transformLine: (text) => text,
        });
    });

    afterEach(() => {
        router.dispose();
    });

    function processFrame(frame: string) {
        router.processFrame(frame);
    }

    function createGmcpFrame(path: string, payload: unknown) {
        const gmcpPayload = `${path} ${JSON.stringify(payload)}`;
        const gmcpData = String.fromCharCode(201) + gmcpPayload;
        return `\u00FF\u00FA${gmcpData}\u00FF\u00F0`;
    }

    function createGmcpMessageFrame(type: string, text: string) {
        const gmcpPayload = JSON.stringify({ type, text: Buffer.from(text, "utf8").toString("base64") });
        const gmcpData = String.fromCharCode(201) + `gmcp_msgs ${gmcpPayload}`;
        return `\u00FF\u00FA${gmcpData}\u00FF\u00F0`;
    }

    test("emits GMCP updates through the event hub", () => {
        const gmcpUpdates: { path: string; value: unknown }[] = [];
        const subscription = eventHub.on("gmcp", (payload) => {
            gmcpUpdates.push(payload);
        });

        processFrame(createGmcpFrame("char.info", { foo: "bar" }));

        expect(gmcpUpdates).toEqual([{ path: "char.info", value: { foo: "bar" } }]);

        subscription.unsubscribe();
    });

    test("emits GMCP message events for decoded payloads", () => {
        const outputLines: RuntimeEvents["outputLine"][] = [];
        const gmcpMessages: RuntimeEvents["gmcpMessage"][] = [];
        const gmcpUpdates: RuntimeEvents["gmcp"][] = [];
        const outputSubscription = eventHub.on("outputLine", (payload) => {
            outputLines.push(payload);
        });
        const gmcpSubscription = eventHub.on("gmcpMessage", (payload) => {
            gmcpMessages.push(payload);
        });
        const gmcpUpdateSubscription = eventHub.on("gmcp", (payload) => {
            gmcpUpdates.push(payload);
        });
        processFrame(createGmcpMessageFrame("room.info", "Look around"));

        expect(outputLines).toEqual([
            {
                index: 0,
                rawText: "Look around",
                text: "Look around",
                type: "room.info",
            },
        ]);
        expect(gmcpMessages).toEqual([
            {
                type: "room.info",
                text: "Look around",
            },
        ]);
        expect(gmcpUpdates).toEqual([
            {
                path: "gmcp_msgs",
                value: { type: "room.info", text: "Look around" },
            },
        ]);

        outputSubscription.unsubscribe();
        gmcpSubscription.unsubscribe();
        gmcpUpdateSubscription.unsubscribe();
    });

    test("decodes GMCP message payloads with lowercase base64 characters", () => {
        const outputLines: RuntimeEvents["outputLine"][] = [];
        const gmcpMessages: RuntimeEvents["gmcpMessage"][] = [];
        const gmcpUpdates: RuntimeEvents["gmcp"][] = [];
        const outputSubscription = eventHub.on("outputLine", (payload) => {
            outputLines.push(payload);
        });
        const gmcpSubscription = eventHub.on("gmcpMessage", (payload) => {
            gmcpMessages.push(payload);
        });
        const gmcpUpdateSubscription = eventHub.on("gmcp", (payload) => {
            gmcpUpdates.push(payload);
        });

        processFrame(createGmcpMessageFrame("room.info", "foghorn"));

        expect(outputLines).toEqual([
            {
                index: 0,
                rawText: "foghorn",
                text: "foghorn",
                type: "room.info",
            },
        ]);
        expect(gmcpMessages).toEqual([
            {
                type: "room.info",
                text: "foghorn",
            },
        ]);
        expect(gmcpUpdates).toEqual([
            {
                path: "gmcp_msgs",
                value: { type: "room.info", text: "foghorn" },
            },
        ]);

        outputSubscription.unsubscribe();
        gmcpSubscription.unsubscribe();
        gmcpUpdateSubscription.unsubscribe();
    });

    test("emits sanitized text messages", () => {
        const messages: string[] = [];
        const subscription = eventHub.on("message", (payload) => {
            messages.push(payload);
        });

        processFrame("Hello adventurer!\n");

        expect(messages).toEqual(["Hello adventurer!\n"]);

        subscription.unsubscribe();
    });
});
