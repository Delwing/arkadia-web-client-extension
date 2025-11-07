import ArkadiaClient from "./ArkadiaClient.ts";
import { getItemSync } from "@modules/core/storage";
import type { UiSettings } from "./uiSettings.ts";

export default class CombatTimer {
  private container: HTMLElement | null;
  private enabled: boolean;
  private lastSeconds: number | null = null;

  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("combat-timer");
    this.enabled = this.getInitialEnabled();
    this.subscribeToUiSettings(client);
    client.on("combatTimer", (seconds: number | null) => this.update(seconds));
    this.update(null);
  }

  private getInitialEnabled(): boolean {
    const stored = getItemSync("uiSettings")?.uiSettings as Partial<UiSettings> | undefined;
    if (stored && typeof stored.showCombatTimer === "boolean") {
      return stored.showCombatTimer;
    }
    if (this.container?.dataset.enabled) {
      return this.container.dataset.enabled !== "0";
    }
    return true;
  }

  private subscribeToUiSettings(client: typeof ArkadiaClient) {
    client.on("uiSettings", (payload) => {
      if (payload && typeof payload.showCombatTimer === "boolean") {
        this.enabled = payload.showCombatTimer;
        this.update(this.lastSeconds);
      }
    });
  }

  private update(seconds: number | null) {
    this.lastSeconds = seconds;
    if (!this.container) return;
    if (!this.enabled || seconds == null || seconds <= 0) {
      this.container.textContent = "";
      this.container.className = "";
      this.container.style.display = "none";
      return;
    }
    this.container.style.display = "block";
    this.container.textContent = `Walka: ${seconds}`;
    if (seconds > 20) {
      this.container.className = "red";
    } else if (seconds > 10) {
      this.container.className = "yellow";
    } else {
      this.container.className = "green";
    }
  }
}
