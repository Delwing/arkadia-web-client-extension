import ArkadiaClient from "./ArkadiaClient";

interface ProgressData {
  label: string;
  current: number;
  total: number;
}

export default class TransportProgress {
  private container: HTMLElement | null;
  private bar: HTMLElement | null;

  constructor(client: typeof ArkadiaClient) {
    this.container = document.getElementById("ride-progress-container");
    this.bar = document.getElementById("ride-progress-bar");

    client.on("rideProgressShow", (data: ProgressData) => this.show(data));
    client.on("rideProgressUpdate", (data: ProgressData) => this.update(data));
    client.on("rideProgressHide", () => this.hide());
  }

  private show(data: ProgressData) {
    if (!this.container || !this.bar) return;
    this.container.style.display = "block";
    this.update(data);
  }

  private update(data: ProgressData) {
    if (!this.container || !this.bar) return;
    const perc = data.total > 0 ? Math.min(1, data.current / data.total) : 0;
    this.bar.style.width = `${Math.floor(perc * 100)}%`;
    this.bar.textContent = `${data.label} ${data.current}/${data.total}`;
  }

  private hide() {
    if (!this.container || !this.bar) return;
    this.container.style.display = "none";
    this.bar.style.width = "0";
    this.bar.textContent = "";
  }
}
