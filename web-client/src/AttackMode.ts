import ArkadiaClient from "./ArkadiaClient.ts";
import { getItemSync } from "@client/src/storage.ts";
import { uiStore, selectTeamStatus } from "./ui/store";
import type { TeamStatus } from "./ui/store";

const MODES = ["A", "AW", "AWR"] as const;
type Mode = typeof MODES[number];

export default class AttackMode {
  private readonly container: HTMLElement | null;
  private index = 0;
  private teamStatus: TeamStatus;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("attack-mode");
    this.teamStatus = uiStore.getState().teamStatus;
    uiStore.subscribe(selectTeamStatus, (status, previous) => {
      this.teamStatus = status;
      if (!previous || status.isLeader !== previous.isLeader) {
        this.updateVisibility();
      }
    });
    if (this.container) {
      this.container.addEventListener("click", () => {
        this.index = (this.index + 1) % MODES.length;
        client.emit("attackMode", MODES[this.index]);
      });
    }
    client.on("attackMode", (mode: Mode) => {
      this.index = MODES.indexOf(mode);
      this.update();
      this.updateVisibility();
    });
    const stored = getItemSync('attack_mode')?.attack_mode as Mode | undefined;
    if (stored && MODES.includes(stored)) {
      this.index = MODES.indexOf(stored);
    }
    this.updateVisibility();
    client.emit("attackMode", MODES[this.index]);
  }

  private update() {
    if (!this.container) return;
    const mode = MODES[this.index];
    this.container.textContent = `Atk: ${mode}`;
    this.container.className = mode;
  }

  private updateVisibility() {
    if (!this.container) return;
    this.container.style.display = this.teamStatus.isLeader ? 'block' : 'none';
  }
}
