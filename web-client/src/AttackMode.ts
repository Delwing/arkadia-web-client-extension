import ArkadiaClient from "./ArkadiaClient.ts";
import { getItemSync } from "@client/src/storage.ts";
import appEventBus from "@client/src/events/app-event-bus.ts";

const MODES = ["A", "AW", "AWR"] as const;
type Mode = typeof MODES[number];

export default class AttackMode {
  private readonly container: HTMLElement | null;
  private index = 0;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("attack-mode");
    if (this.container) {
      this.container.addEventListener("click", () => {
        this.index = (this.index + 1) % MODES.length;
        appEventBus.emit("attackMode", MODES[this.index]);
      });
    }
    appEventBus.on("attackMode", (mode: Mode) => {
      this.index = MODES.indexOf(mode);
      this.update();
      this.updateVisibility();
    });
    appEventBus.on("teamChange", () => this.updateVisibility());
    const stored = getItemSync('attack_mode')?.attack_mode as Mode | undefined;
    if (stored && MODES.includes(stored)) {
      this.index = MODES.indexOf(stored);
    }
    appEventBus.emit("attackMode", MODES[this.index]);
  }

  private update() {
    if (!this.container) return;
    const mode = MODES[this.index];
    this.container.textContent = `Atk: ${mode}`;
    this.container.className = mode;
  }

  private updateVisibility() {
    if (!this.container) return;
    const leader = !!(window as any).clientExtension?.TeamManager?.isLeader?.();
    this.container.style.display = leader ? 'block' : 'none';
  }
}
