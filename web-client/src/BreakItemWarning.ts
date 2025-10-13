import ArkadiaClient from "./ArkadiaClient.ts";
import appEventBus from "@client/src/events/app-event-bus.ts";

interface Data {
  text: string;
  command?: string;
}

export default class BreakItemWarning {
  private container: HTMLElement | null;
  private client: typeof ArkadiaClient;
  private command: string | null = null;
  constructor(client: typeof ArkadiaClient) {
    this.client = client;
    this.container = document.getElementById("break-item-warning");
    if (this.container) {
      this.container.addEventListener("click", () => {
        if (this.command) {
          const clientWithSendCommand = this.client as unknown as {
            sendCommand?: (command: string) => void;
            send: (command: string) => void;
          };
          if (typeof clientWithSendCommand.sendCommand === "function") {
            clientWithSendCommand.sendCommand(this.command);
          } else {
            this.client.send(this.command);
          }
        }
        this.update(null);
      });
    }
    appEventBus.on("breakItem", (data: Data) => this.update(data));
  }

  private update(data: Data | null) {
    if (!this.container) return;
    if (!data) {
      this.container.style.display = "none";
      this.container.textContent = "";
      this.command = null;
      return;
    }
    this.container.textContent = data.text;
    this.command = data.command ?? null;
    this.container.style.display = "block";
  }
}
