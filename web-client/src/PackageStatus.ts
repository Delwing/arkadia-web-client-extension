import ArkadiaClient from "./ArkadiaClient.ts";

interface StatusData {
  recipient: string | null;
  seconds?: number | null;
}

export default class PackageStatus {
  private container: HTMLElement | null;
  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("package-status");
    client.on("packageStatus", (data: StatusData | null) => this.update(data));
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
      this.container.textContent = `paczka: ${recipient}`;
    } else {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      this.container.textContent = `paczka: ${recipient} ${m}:${s.toString().padStart(2, "0")}`;
    }
    this.container.style.display = "block";
  }
}
