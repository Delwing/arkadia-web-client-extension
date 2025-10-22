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
    if (!payload || payload.remaining <= 0) {
      this.container.textContent = "";
      this.container.className = "";
      this.container.style.display = "none";
      return;
    }
    const minutes = Math.floor(payload.remaining / 60);
    const seconds = Math.floor(payload.remaining % 60);
    const secondsText = seconds.toString().padStart(2, "0");
    this.container.textContent = `Tr: ${payload.label} ${minutes}:${secondsText}`;
    if (payload.remaining < 30) {
      this.container.className = "red";
    } else if (payload.remaining < 60) {
      this.container.className = "yellow";
    } else {
      this.container.className = "green";
    }
    this.container.style.display = "block";
  }
}
