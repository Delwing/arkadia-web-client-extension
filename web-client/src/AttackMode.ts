import ArkadiaClient from "./ArkadiaClient.ts";

const MODES = ["A", "AW", "AWR"] as const;
type Mode = typeof MODES[number];

export default class AttackMode {
  private container: HTMLElement | null;
  private index = 0;
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
    this.update();
  }

  private update() {
    if (!this.container) return;
    const mode = MODES[this.index];
    this.container.textContent = `Atk: ${mode}`;
    this.container.style.display = 'block';
    this.container.className = mode;
  }
}
