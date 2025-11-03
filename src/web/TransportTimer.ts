import ArkadiaClient from "./ArkadiaClient.ts";
import { getItemSync } from "@modules/core/storage";
import type { UiSettings } from "./uiSettings.ts";
import type { TransportTimerPayload } from "@client/types/transport";

export default class TransportTimer {
  private container: HTMLElement | null;
  private showTransportLabel: boolean;
  private lastPayload: TransportTimerPayload | null = null;

  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("transport-timer");
    this.showTransportLabel = this.getInitialShowTransportLabel();
    this.subscribeToUiSettings(client);
    client.on("transportTimer", (payload: TransportTimerPayload | null) => this.update(payload));
    this.update(null);
  }

  private getInitialShowTransportLabel(): boolean {
    const stored = getItemSync("uiSettings")?.uiSettings as Partial<UiSettings> | undefined;
    if (stored && typeof stored.showTransportLabel === "boolean") {
      return stored.showTransportLabel;
    }
    return true;
  }

  private subscribeToUiSettings(client: typeof ArkadiaClient) {
    client.on("uiSettings", (payload) => {
      if (payload && typeof payload.showTransportLabel === "boolean") {
        this.showTransportLabel = payload.showTransportLabel;
        this.update(this.lastPayload);
      }
    });
  }

  private update(payload: TransportTimerPayload | null) {
    this.lastPayload = payload;
    if (!this.container) return;
    if (!this.showTransportLabel) {
      this.container.textContent = "";
      this.container.className = "";
      this.container.style.display = "none";
      return;
    }
    if (!payload) {
      this.container.textContent = "";
      this.container.className = "";
      this.container.style.display = "none";
      return;
    }
    const hasTimer = typeof payload.remaining === "number" && typeof payload.total === "number";
    const parts = ["Tr:"];
    if (this.showTransportLabel) {
      parts.push(payload.label);
    }
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
