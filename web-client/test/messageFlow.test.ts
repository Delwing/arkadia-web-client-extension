import MessageRouter from "@client/src/runtime/transport/message-router";
import { runtimeEventHub } from "@client/src/runtime/event-hub";
import MockTransportAdapter from "@client/src/runtime/transport/mock-adapter";
import eventBus from "@client/src/eventBus";

describe("message flow debug", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="main_text_output_msg_wrapper"><div id="split-bottom"></div></div>
      <div id="sticky-area"></div>
      <div id="context-menu"></div>
      <div id="panel_buttons_bottom"></div>
    `;
    (window as any).Output = { send: (text: string, type?: string) => {
      eventBus.emit("message", text, type);
    }};
    (window as any).clientExtension = {
      onLine: (text: string) => text,
    };
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("emits a single message for plain text", () => {
    const transport = new MockTransportAdapter({ emitLifecycle: false });
    const router = new MessageRouter(transport, runtimeEventHub, {
      parseAnsiPatterns: (text) => text,
    });
    const listener = jest.fn();
    eventBus.on("message", listener);

    router.processFrame("Hello Adventurer!\n");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("emits a single message for gmcp output", () => {
    const transport = new MockTransportAdapter({ emitLifecycle: false });
    const router = new MessageRouter(transport, runtimeEventHub, {
      parseAnsiPatterns: (text) => text,
    });
    const listener = jest.fn();
    eventBus.on("message", listener);

    const payload = JSON.stringify({ type: "room.info", text: btoa("Look around") });
    const frame = `\u00FF\u00FA${String.fromCharCode(201)}gmcp_msgs ${payload}\u00FF\u00F0`;
    router.processFrame(frame);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith("Look around", "room.info");
  });
  it("appends elements similar to UI handler", () => {
    const transport = new MockTransportAdapter({ emitLifecycle: false });
    const router = new MessageRouter(transport, runtimeEventHub, {
      parseAnsiPatterns: (text) => text,
    });
    const outputWrapper = document.getElementById("main_text_output_msg_wrapper")!;
    const splitBottom = document.getElementById("split-bottom")!;
    eventBus.on("message", (message: string, type?: string) => {
      if (!message) {
        return;
      }
      const wrapper = document.createElement("div");
      wrapper.classList.add("output_msg");
      if (type) {
        wrapper.classList.add(type);
      }
      const messageDiv = document.createElement("div");
      messageDiv.innerHTML = message;
      messageDiv.classList.add("output_msg_text");
      messageDiv.style.whiteSpace = "pre-wrap";
      wrapper.appendChild(messageDiv);
      outputWrapper.insertBefore(wrapper, splitBottom);
    });

    router.processFrame("Hello Adventurer!\n");

    expect(outputWrapper.querySelectorAll(".output_msg").length).toBe(1);

    const payload = JSON.stringify({ type: "room.info", text: btoa("Look around") });
    const frame = `\u00FF\u00FA${String.fromCharCode(201)}gmcp_msgs ${payload}\u00FF\u00F0`;
    router.processFrame(frame);

    expect(outputWrapper.querySelectorAll(".output_msg").length).toBe(2);
    const gmcpElement = Array.from(outputWrapper.querySelectorAll(".output_msg")).find((el) =>
      el.className.includes("room.info")
    );
    expect(gmcpElement).toBeDefined();
  });
});
