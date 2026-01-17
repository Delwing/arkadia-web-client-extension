import ArkadiaClient from "./ArkadiaClient.ts";
import type { TransportTimerPayload } from "@client/types/transport";

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
    const hasTimer = typeof payload.remaining === "number" && typeof payload.total === "number";
    const parts = ["Tr:", payload.label];
    if (hasTimer) {
      const remaining = Math.max(0, payload.remaining);
      const minutes = Math.floor(remaining / 60);
      const seconds = Math.floor(remaining % 60);
      const secondsText = seconds.toString().padStart(2, "0");
      parts.push(`${minutes}:${secondsText}`);
      if (remaining < 10) {
        this.container.className = "red";
      } else if (remaining < 30) {
        this.container.className = "yellow";
      } else {
        this.container.className = "green";
      }
    } else {
      this.container.className = "";
    }
    this.container.textContent = parts.join(" ");
    this.container.style.display = "block";
  }
}
