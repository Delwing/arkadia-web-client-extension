import ArkadiaClient from "./ArkadiaClient.ts";
import appEventBus from "@client/src/events/app-event-bus.ts";

export default class CharStateInfo {
  private container: HTMLElement | null;
  constructor(client: ArkadiaClient) {
    this.container = document.getElementById("state-info");
    appEventBus.on("gmcp.char.state", (state: any) => this.update(state));
  }

  private update(state: any) {
    if (!this.container) return;
    const text = typeof state?.state === "string" ? state.state : "";
    if (text) {
      this.container.textContent = text;
      this.container.style.display = "block";
    } else {
      this.container.textContent = "";
      this.container.style.display = "none";
    }
  }
}
