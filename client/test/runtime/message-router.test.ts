import MessageRouter from "../../src/runtime/transport/message-router";
import { EventHub, bridgeRuntimeEventsToLegacyEventBus, type RuntimeEvents } from "../../src/runtime/event-hub";
import MockTransportAdapter from "../../src/runtime/transport/mock-adapter";
import eventBus from "../../src/eventBus";

describe("MessageRouter runtime event hub integration", () => {
    let eventHub: EventHub<RuntimeEvents>;
    let router: MessageRouter;
    let teardownBridge: (() => void) | null = null;

    beforeEach(() => {
        eventHub = new EventHub<RuntimeEvents>();
        teardownBridge = bridgeRuntimeEventsToLegacyEventBus(eventHub);
        router = new MessageRouter(new MockTransportAdapter({ emitLifecycle: false }), eventHub, {
            parseAnsiPatterns: (text) => text,
            transformLine: (text) => text,
        });
    });

    afterEach(() => {
        router.dispose();
        if (teardownBridge) {
            teardownBridge();
            teardownBridge = null;
        }
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

    test("forwards GMCP updates through the event hub and legacy event bus", () => {
        const gmcpUpdates: { path: string; value: unknown }[] = [];
        const subscription = eventHub.on("gmcp", (payload) => {
            gmcpUpdates.push(payload);
        });
        const busListener = jest.fn();
        eventBus.on("gmcp.char.info", busListener);

        processFrame(createGmcpFrame("char.info", { foo: "bar" }));

        expect(gmcpUpdates).toEqual([{ path: "char.info", value: { foo: "bar" } }]);
        expect(busListener).toHaveBeenCalledWith({ foo: "bar" });

        subscription.unsubscribe();
        eventBus.off("gmcp.char.info", busListener);
    });

    test("flushes buffered GMCP messages as output and gmcp_msg events", () => {
        const outputLines: RuntimeEvents["outputLine"][] = [];
        const gmcpMessages: RuntimeEvents["gmcpMessage"][] = [];
        const outputSubscription = eventHub.on("outputLine", (payload) => {
            outputLines.push(payload);
        });
        const gmcpSubscription = eventHub.on("gmcpMessage", (payload) => {
            gmcpMessages.push(payload);
        });
        const gmcpMsgListener = jest.fn();
        const outputSentListener = jest.fn();
        eventBus.on("gmcp_msg.room.info", gmcpMsgListener);
        eventBus.on("output-sent", outputSentListener);

        processFrame(createGmcpMessageFrame("room.info", "Look around"));

        expect(outputLines).toEqual([
            {
                text: "Look around",
                rawText: "Look around",
                type: "room.info",
                index: 0,
            },
        ]);
        expect(gmcpMessages).toEqual([
            {
                type: "room.info",
                text: "Look around",
            },
        ]);
        expect(outputSentListener).toHaveBeenCalledWith(1);
        expect(gmcpMsgListener).toHaveBeenCalledWith("Look around");
        const outputOrder = outputSentListener.mock.invocationCallOrder[0];
        const gmcpOrder = gmcpMsgListener.mock.invocationCallOrder[0];
        expect(outputOrder).toBeLessThan(gmcpOrder);

        outputSubscription.unsubscribe();
        gmcpSubscription.unsubscribe();
        eventBus.off("gmcp_msg.room.info", gmcpMsgListener);
        eventBus.off("output-sent", outputSentListener);
    });

    test("emits sanitized text messages", () => {
        const outputLines: RuntimeEvents["outputLine"][] = [];
        const outputSubscription = eventHub.on("outputLine", (payload) => {
            outputLines.push(payload);
        });
        const outputSentListener = jest.fn();
        eventBus.on("output-sent", outputSentListener);
        (window as any).Output = { send: jest.fn() };

        processFrame("Hello adventurer!\n");

        expect(outputLines).toEqual([
            {
                text: "Hello adventurer!\n",
                rawText: "Hello adventurer!\n",
                type: "text",
                index: 0,
            },
        ]);
        expect((window as any).Output.send).toHaveBeenCalledWith("Hello adventurer!\n", "text");
        expect(outputSentListener).toHaveBeenCalledWith(1);

        outputSubscription.unsubscribe();
        eventBus.off("output-sent", outputSentListener);
        delete (window as any).Output;
    });
});
