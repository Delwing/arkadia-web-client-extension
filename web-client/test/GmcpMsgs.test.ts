import arkadiaClient from "../src/ArkadiaClient";

describe("gmcp_msgs handling", () => {
  let originalClientExtension: any;

  beforeEach(() => {
    originalClientExtension = (window as any).clientExtension;
    (window as any).clientExtension = {
      onLine: jest.fn((line: string) => line),
    };
  });

  afterEach(() => {
    if (originalClientExtension) {
      (window as any).clientExtension = originalClientExtension;
    } else {
      delete (window as any).clientExtension;
    }
  });

  test("decodes gmcp base64 payloads into plain text output", () => {
    const gmcpPlainText = "Przykladowa wiadomosc gmcp.\n";
    const gmcpPayload = JSON.stringify({ text: btoa(gmcpPlainText), type: "other" });
    const gmcpMessage = String.fromCharCode(201) + "gmcp_msgs " + gmcpPayload;

    const messageListener = jest.fn();
    const gmcpListener = jest.fn();

    arkadiaClient.on("message", messageListener as any);
    arkadiaClient.on("gmcp_msg.other", gmcpListener);

    (arkadiaClient as any).parseTelnetSubnegotiation(gmcpMessage);
    (arkadiaClient as any).flushMessageBuffer();

    expect((window as any).clientExtension.onLine).toHaveBeenCalledWith(gmcpPlainText, "other");
    expect(gmcpListener).toHaveBeenCalledTimes(1);
    expect(gmcpListener.mock.calls[0][0]).toContain("Przykladowa wiadomosc gmcp.");

    expect(messageListener).toHaveBeenCalledTimes(1);
    expect(messageListener.mock.calls[0][0]).toContain("Przykladowa wiadomosc gmcp.");
    expect(messageListener.mock.calls[0][1]).toBe("other");

    arkadiaClient.off("message", messageListener as any);
    arkadiaClient.off("gmcp_msg.other", gmcpListener);
  });
});
