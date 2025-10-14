import ArkadiaClient from "./ArkadiaClient.ts";
import appEventBus from "@client/src/events/app-event-bus.ts";

export default class CoverTimer {
  private container: HTMLElement | null;
  constructor(client: ArkadiaClient) {
    this.container = document.getElementById("cover-timer");
    appEventBus.on("coverTimer", (sec: number | null) => this.update(sec));
    this.update(null);
  }

  private update(seconds: number | null) {
    if (!this.container) return;
    if (seconds == null || seconds <= 0) {
      this.container.textContent = "Zas: OK";
      this.container.className = "green";
    } else {
      this.container.textContent = `Zas: ${seconds.toFixed(2)}`;
      this.container.className = "yellow";
    }
    this.container.style.display = "block";
  }
}
