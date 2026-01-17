import ArkadiaClient from "./ArkadiaClient.ts";

export default class CombatTimer {
  private container: HTMLElement | null;

  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("combat-timer");
    client.on("combatTimer", (seconds: number | null) => this.update(seconds));
    this.update(null);
  }

  private update(seconds: number | null) {
    if (!this.container) return;
    if (seconds == null || seconds <= 0) {
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
