import appEventBus from "@client/src/events/app-event-bus.ts";

interface DisplayMultibind {
  index: number;
  action: string;
  label: string;
}

export default class MultiBinds {
  private container: HTMLElement | null;

  constructor() {
    this.container = document.getElementById("multi-binds");
    appEventBus.on(
      "multibinds",
      (payload: { list?: DisplayMultibind[] } = { list: [] }) => {
        const list = Array.isArray(payload.list) ? payload.list : [];
        this.render(list);
      },
    );
  }

  private render(list: DisplayMultibind[]) {
    if (!this.container) return;
    this.container.innerHTML = "";
    if (!list.length) {
      this.container.classList.remove("active");
      return;
    }
    this.container.classList.add("active");
    list
      .slice()
      .sort((a, b) => a.index - b.index)
      .forEach((bind) => {
        const wrapper = document.createElement("span");
        wrapper.className = "multi-bind";

        const keySpan = document.createElement("span");
        keySpan.className = "multi-bind-key";
        keySpan.textContent = `[${bind.label}]`;

        const actionSpan = document.createElement("span");
        actionSpan.className = "multi-bind-action";
        actionSpan.textContent = bind.action;

        wrapper.append(keySpan, document.createTextNode(" "), actionSpan);
        this.container!.appendChild(wrapper);
      });
  }
}
