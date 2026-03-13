import ArkadiaClient from "./ArkadiaClient.ts";
import type {GmcpCharState} from "@shared/events";

export default class CharStateInfo {
  private container: HTMLElement | null;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("state-info");
    client.on("gmcp.char.state", (state) => this.update(state));
  }

  private update(state: GmcpCharState) {
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
