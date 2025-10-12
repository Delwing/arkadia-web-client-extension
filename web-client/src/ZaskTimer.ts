import { uiStore, selectZaskTimer } from "./ui/store";
import type { ZaskTimerState } from "./ui/store";

export default class ZaskTimer {
  private container: HTMLElement | null;

  constructor() {
    this.container = document.getElementById("zask-timer");
    uiStore.subscribe(selectZaskTimer, (payload) => this.update(payload), { fireImmediately: true });
  }

  private update(payload: ZaskTimerState | null) {
    if (!this.container) return;

    if (!payload) {
      this.container.textContent = "";
      this.container.className = "";
      this.container.style.display = "none";
      return;
    }

    this.container.style.display = "block";
    if (payload.ok) {
      this.container.textContent = "Zask: OK";
      this.container.className = "green";
    } else {
      this.container.textContent = `Zask: ${payload.seconds}`;
      if (payload.seconds >= 20) {
        this.container.className = "yellow";
      } else {
        this.container.className = "red";
      }
    }
  }
}
