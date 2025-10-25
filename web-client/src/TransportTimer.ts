import ArkadiaClient from "./ArkadiaClient.ts";
import type { TransportTimerPayload } from "@client/src/types/transport";
import { subscribeToUiSettings } from "@client/src/state/settingsStore";

export default class TransportTimer {
  private container: HTMLElement | null;
  private showTransportLabel: boolean;
  private lastPayload: TransportTimerPayload | null = null;
  private detachUiSettings?: () => void;

  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("transport-timer");
    this.showTransportLabel = true;
    this.subscribeToUiSettings();
    client.on("transportTimer", (payload: TransportTimerPayload | null) => this.update(payload));
    this.update(null);
    window.addEventListener("beforeunload", () => {
      this.detachUiSettings?.();
      this.detachUiSettings = undefined;
    }, { once: true });
  }

  private subscribeToUiSettings() {
    this.detachUiSettings = subscribeToUiSettings(
      ui => ui.showTransportLabel,
      (value) => {
        const next = typeof value === "boolean" ? value : true;
        if (this.showTransportLabel !== next) {
          this.showTransportLabel = next;
          this.update(this.lastPayload);
        }
      },
      { fireImmediately: true },
    );
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
