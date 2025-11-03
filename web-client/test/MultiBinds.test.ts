import eventBus from "@client/src/eventBus.ts";
import { clearClientInstance } from "../src/clientRegistry";
import MultiBinds from "../src/MultiBinds";

describe("MultiBinds", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="multi-binds"></div>';
  });

  afterEach(() => {
    clearClientInstance();
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

  it("falls back to ArkadiaClient.send when clientExtension is missing", () => {
    const listeners: Record<string, (payload: unknown) => void> = {};
    const send = jest.fn();
    const client = {
      on: (event: string, handler: (payload: unknown) => void) => {
        listeners[event] = handler;
      },
      send,
    } as any;

    new MultiBinds(client);

    const payload = {
      list: [
        { index: 2, action: "say hello", label: "ALT+2" },
      ],
    };

    listeners.multibinds?.(payload);

    const button = document.querySelector<HTMLButtonElement>("#multi-binds .multi-bind");
    expect(button).not.toBeNull();
    button!.click();

    expect(send).toHaveBeenCalledWith("say hello");
  });
});
