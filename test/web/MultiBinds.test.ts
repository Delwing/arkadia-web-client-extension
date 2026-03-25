import eventBus from "@modules/core/eventBus";
import MultiBinds from "../../src/web/MultiBinds";

describe("MultiBinds", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="multi-binds"></div>';
  });

  afterEach(() => {
    eventBus.clear("sendCommand");
  });

  it("emits sendCommand when available", () => {
    const listeners: Record<string, (payload: unknown) => void> = {};
    const client = {
      on: (event: string, handler: (payload: unknown) => void) => {
        listeners[event] = handler;
      },
      send: jest.fn(),
    } as any;

    const commandListener = jest.fn();
    const unsubscribe = eventBus.on("sendCommand", commandListener as any);

    new MultiBinds(client);

    const payload = {
      list: [
        { index: 1, action: "=aliasRun", label: "ALT+1" },
      ],
    };

    listeners.multibinds?.(payload);

    const button = document.querySelector<HTMLButtonElement>("#multi-binds .multi-bind");
    expect(button).not.toBeNull();
    button!.click();

    expect(commandListener).toHaveBeenCalledWith({ command: "=aliasRun" });
    expect(client.send).not.toHaveBeenCalled();
    unsubscribe();
  });
});
