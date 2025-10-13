import ArkadiaClient from "./ArkadiaClient.ts";
import appEventBus from "@client/src/events/app-event-bus.ts";

export default class ReleaseGuard {
  private container: HTMLElement | null;
  private state = true;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("release-guard");
    if (this.container) {
      this.container.addEventListener("click", () => {
        appEventBus.emit("releaseGuard", !this.state);
      });
    }
    appEventBus.on("releaseGuard", (state: boolean) => {
      this.state = state;
      this.update(state);
    });
    // show current state on start
    this.update(this.state);
  }

  private update(state: boolean) {
    if (!this.container) return;
    this.container.textContent = `Pusc zas: ${state ? 'on' : 'off'}`;
    this.container.style.display = 'block';
    this.container.className = state ? 'on' : 'off';
  }
}
