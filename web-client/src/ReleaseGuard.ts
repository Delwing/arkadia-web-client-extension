import ArkadiaClient from "./ArkadiaClient.ts";

export default class ReleaseGuard {
  private container: HTMLElement | null;
  private state = true;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("release-guard");
    client.on("releaseGuard", (state: boolean) => {
      this.state = state;
      this.update(state);
    });
    // show current state on start
    this.update(this.state);
  }

  private update(state: boolean) {
    if (!this.container) return;
    this.container.textContent = `Zaslona: ${state ? 'on' : 'off'}`;
    this.container.style.display = 'block';
    this.container.className = state ? 'on' : 'off';
  }
}
