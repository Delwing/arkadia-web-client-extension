import ArkadiaClient from "./ArkadiaClient.ts";
import { getItemSync } from "@client/src/storage.ts";
import { subscribeToUiStore } from "./ui/store";

const MODES = ["A", "AW", "AWR"] as const;
type Mode = typeof MODES[number];

export default class AttackMode {
  private readonly container: HTMLElement | null;
  private index = 0;
  private unsubscribeLeader?: () => void;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("attack-mode");
    if (this.container) {
      this.container.addEventListener("click", () => {
        this.index = (this.index + 1) % MODES.length;
        client.emit("attackMode", MODES[this.index]);
      });
    }
    client.on("attackMode", (mode: Mode) => {
      this.index = MODES.indexOf(mode);
      this.update();
    });
    const stored = getItemSync('attack_mode')?.attack_mode as Mode | undefined;
    if (stored && MODES.includes(stored)) {
      this.index = MODES.indexOf(stored);
    }
    client.emit("attackMode", MODES[this.index]);

    this.unsubscribeLeader = subscribeToUiStore(
      (state) => state.teamStatus.isLeader,
      (isLeader) => this.updateVisibility(isLeader),
      { fireImmediately: true },
    );
  }

  private update() {
    if (!this.container) return;
    const mode = MODES[this.index];
    this.container.textContent = `Atk: ${mode}`;
    this.container.className = mode;
  }

  private updateVisibility(isLeader: boolean) {
    if (!this.container) return;
    this.container.style.display = isLeader ? 'block' : 'none';
  }
}
