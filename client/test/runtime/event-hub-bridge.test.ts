import eventBus from "../../src/eventBus";
import { EventHub, RuntimeEvents, bridgeRuntimeEventsToLegacyEventBus } from "../../src/runtime/event-hub";

describe("runtime event hub legacy bridge", () => {
    function withBridge(callback: (hub: EventHub<RuntimeEvents>) => void) {
        const hub = new EventHub<RuntimeEvents>();
        const teardown = bridgeRuntimeEventsToLegacyEventBus(hub);
        try {
            callback(hub);
        } finally {
            teardown();
        }
    }

    test("forwards gmcp updates to the legacy event bus", () => {
        withBridge((hub) => {
            const gmcpEvents: { path: string; value: unknown }[] = [];
            const roomInfo: unknown[] = [];
            const gmcpListener = (payload: { path: string; value: unknown }) => {
                gmcpEvents.push(payload);
            };
            const roomInfoListener = (payload: unknown) => {
                roomInfo.push(payload);
            };

            eventBus.on("gmcp", gmcpListener);
            eventBus.on("gmcp.room.info", roomInfoListener);

            try {
                const payload = { foo: "bar" };
                hub.emit("gmcp", { path: "room.info", value: payload });

                expect(gmcpEvents).toEqual([{ path: "room.info", value: payload }]);
                expect(roomInfo).toEqual([payload]);
            } finally {
                eventBus.off("gmcp", gmcpListener);
                eventBus.off("gmcp.room.info", roomInfoListener);
            }
        });
    });

    test("re-emits runtime output and command events", () => {
        withBridge((hub) => {
            const outputCounts: number[] = [];
            const commands: string[] = [];
            const outputListener = (count: number) => {
                outputCounts.push(count);
            };
            const commandListener = (command: string) => {
                commands.push(command);
            };

            eventBus.on("output-sent", outputListener);
            eventBus.on("command", commandListener);

            try {
                hub.emit("outputFlushed", { count: 2 });
                hub.emit("command", "look");

                expect(outputCounts).toEqual([2]);
                expect(commands).toEqual(["look"]);
            } finally {
                eventBus.off("output-sent", outputListener);
                eventBus.off("command", commandListener);
            }
        });
    });
});
