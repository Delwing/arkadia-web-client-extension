import ArkadiaClient from "./ArkadiaClient.ts";
import appEventBus from "@client/src/events/app-event-bus.ts";

interface ZaskTimerPayload {
  seconds: number;
  ok: boolean;
}

export default class ZaskTimer {
  private container: HTMLElement | null;

  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("zask-timer");
    appEventBus.on("zaskTimer", (payload: ZaskTimerPayload | null) => this.update(payload));
    this.update(null);
  }

  private update(payload: ZaskTimerPayload | null) {
    if (!this.container) return;

    if (!payload) {
      this.container.textContent = "";
      this.container.className = "";
      this.container.style.display = "none";
      return;
    }

    this.container.style.display = "block";
    if (payload.ok) {
      this.container.textContent = "Zask: OK";
      this.container.className = "green";
    } else {
      this.container.textContent = `Zask: ${payload.seconds}`;
      if (payload.seconds >= 20) {
        this.container.className = "yellow";
      } else {
        this.container.className = "red";
      }
    }
  }
}
