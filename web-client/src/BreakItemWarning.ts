import ArkadiaClient from "./ArkadiaClient.ts";

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
          this.client.sendCommand(this.command);
        }
        this.update(null);
      });
    }
    client.on("breakItem", (data: Data) => this.update(data));
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
