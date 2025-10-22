import ArkadiaClient from "./ArkadiaClient.ts";
import type { TransportTimerPayload } from "@client/src/types/transport";

export default class TransportTimer {
  private container: HTMLElement | null;

  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("transport-timer");
    client.on("transportTimer", (payload: TransportTimerPayload | null) => this.update(payload));
    this.update(null);
  }

  private update(payload: TransportTimerPayload | null) {
    if (!this.container) return;
    if (!payload) {
      this.container.textContent = "";
      this.container.className = "";
      this.container.style.display = "none";
      return;
    }
    const remaining = Math.max(0, payload.remaining);
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    const secondsText = seconds.toString().padStart(2, "0");
    this.container.textContent = `Tr: ${payload.label} ${minutes}:${secondsText}`;
    if (remaining < 10) {
      this.container.className = "red";
    } else if (remaining < 30) {
      this.container.className = "yellow";
    } else {
      this.container.className = "green";
    }
    this.container.style.display = "block";
  }
}
