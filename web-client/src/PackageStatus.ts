import ArkadiaClient from "./ArkadiaClient.ts";
import appEventBus from "@client/src/events/app-event-bus.ts";

interface StatusData {
  recipient: string | null;
  seconds?: number | null;
}

export default class PackageStatus {
  private container: HTMLElement | null;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("package-status");
    appEventBus.on("packageStatus", (data: StatusData | null) => this.update(data));
  }

  private update(data: StatusData | null) {
    if (!this.container) return;
    if (!data || !data.recipient) {
      this.container.style.display = "none";
      this.container.textContent = "";
      return;
    }
    const { recipient, seconds } = data;
    if (seconds == null || seconds <= 0) {
      this.container.textContent = `📦: ${recipient}`;
    } else {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      this.container.textContent = `📦: ${recipient} ${m}:${s.toString().padStart(2, "0")}`;
    }
    this.container.style.display = "block";
  }
}
