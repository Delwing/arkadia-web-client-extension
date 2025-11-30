import ArkadiaClient from "./ArkadiaClient.ts";

export default class ReleaseGuardTimer {
  private container: HTMLElement | null;
  private guardState = true;
  private timerSeconds: number | null = null;

  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("release-guard-timer");
    if (this.container) {
      // Click anywhere on element to toggle guard state
      this.container.addEventListener("click", () => {
        client.emit("releaseGuard", !this.guardState);
      });
    }
    client.on("releaseGuard", (state: boolean) => {
      this.guardState = state;
      this.update();
    });
    client.on("coverTimer", (sec: number | null) => {
      this.timerSeconds = sec;
      this.update();
    });
    // show current state on start
    this.update();
  }

  private update() {
    if (!this.container) return;

    const isTimerActive = this.timerSeconds != null && this.timerSeconds > 0;
    const guardColor = this.guardState ? "white" : "dimgray";

    let timerHtml: string;
    if (isTimerActive) {
      timerHtml = `<span style="color: yellow;">${this.timerSeconds!.toFixed(2)}</span>`;
    } else {
      timerHtml = `<span style="color: springgreen;">OK</span>`;
    }

    this.container.innerHTML =
      `<span style="color: ${guardColor};">Pusc</span>` +
      `<span style="color: white;"> Zas: </span>${timerHtml}`;
    this.container.style.display = "block";
    this.container.style.cursor = "pointer";
  }
}
