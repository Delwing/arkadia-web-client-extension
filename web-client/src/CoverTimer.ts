import { uiStore, selectCoverTimer } from "./ui/store";

export default class CoverTimer {
  private container: HTMLElement | null;
  constructor() {
    this.container = document.getElementById("cover-timer");
    uiStore.subscribe(selectCoverTimer, (seconds) => this.update(seconds), { fireImmediately: true });
  }

  private update(seconds: number | null) {
    if (!this.container) return;
    if (seconds == null || seconds <= 0) {
      this.container.textContent = "Zas: OK";
      this.container.className = "green";
    } else {
      this.container.textContent = `Zas: ${seconds.toFixed(2)}`;
      this.container.className = "yellow";
    }
    this.container.style.display = "block";
  }
}
