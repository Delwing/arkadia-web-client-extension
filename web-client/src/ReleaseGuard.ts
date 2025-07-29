import ArkadiaClient from "./ArkadiaClient.ts";

export default class ReleaseGuard {
  private container: HTMLElement | null;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("release-guard");
    client.on("releaseGuard", (state: boolean) => this.update(state));
  }

  private update(state: boolean) {
    if (!this.container) return;
    this.container.textContent = `guard ${state ? 'ON' : 'OFF'}`;
    this.container.style.display = 'block';
    this.container.className = state ? 'on' : 'off';
  }
}
