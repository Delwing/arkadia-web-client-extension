import MultiBinds from "../src/MultiBinds";

describe("MultiBinds", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="multi-binds"></div>';
  });

  afterEach(() => {
    delete (window as any).clientExtension;
  });

  it("uses clientExtension.sendCommand when available", () => {
    const listeners: Record<string, (payload: unknown) => void> = {};
    const client = {
      on: (event: string, handler: (payload: unknown) => void) => {
        listeners[event] = handler;
      },
      send: jest.fn(),
    } as any;

    const sendCommand = jest.fn().mockResolvedValue(undefined);
    (window as any).clientExtension = { sendCommand };

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

    expect(sendCommand).toHaveBeenCalledWith("=aliasRun");
    expect(client.send).not.toHaveBeenCalled();
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

