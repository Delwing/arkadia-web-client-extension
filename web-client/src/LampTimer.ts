import { uiStore, selectLampTimer } from "./ui/store";

export default class LampTimer {
  private container: HTMLElement | null;
  constructor() {
    this.container = document.getElementById("lamp-timer");
    uiStore.subscribe(selectLampTimer, (seconds) => this.update(seconds), { fireImmediately: true });
  }

  private update(seconds: number | null) {
    if (!this.container) return;
    if (seconds == null || seconds <= 0) {
      this.container.style.display = "none";
      this.container.textContent = "";
      this.container.className = "";
      return;
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    this.container.textContent = `lamp ${m}:${s.toString().padStart(2, "0")}`;
    this.container.style.display = "block";
    if (seconds < 30) {
      this.container.className = "red";
    } else if (seconds < 60) {
      this.container.className = "yellow";
    } else {
      this.container.className = "green";
    }
  }
}
