import ArkadiaClient from "./ArkadiaClient.ts";

export default class CoverTimer {
  private container: HTMLElement | null;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("cover-timer");
    client.on("coverTimer", (sec: number | null) => this.update(sec));
    this.update(null);
  }

  private update(seconds: number | null) {
    if (!this.container) return;
    if (seconds == null || seconds <= 0) {
      this.container.textContent = "cover";
    } else {
      this.container.textContent = `cover ${seconds.toFixed(2)}`;
    }
    this.container.style.display = "block";
  }
}
