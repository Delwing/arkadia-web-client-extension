import eventBus from "@client/src/eventBus.ts";

interface MultiBindsClient {
  on(event: "multibinds", handler: (payload: { list?: DisplayMultibind[] }) => void): void;
  send(command: string): void;
}

interface DisplayMultibind {
  index: number;
  action: string;
  label: string;
}

export default class MultiBinds {
  private container: HTMLElement | null;

  constructor(private readonly client: MultiBindsClient) {
    this.container = document.getElementById("multi-binds");
    this.client.on(
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
        const wrapper = document.createElement("button");
        wrapper.className = "multi-bind";
        wrapper.type = "button";
        wrapper.title = bind.action;

        const keySpan = document.createElement("span");
        keySpan.className = "multi-bind-key";
        keySpan.textContent = `[${bind.label}]`;

        const actionSpan = document.createElement("span");
        actionSpan.className = "multi-bind-action";
        actionSpan.textContent = bind.action;

        const { action } = bind;
        if (action.trim()) {
          wrapper.addEventListener("click", (event) => {
            event.preventDefault();
            eventBus.emit("sendCommand", { command: action });
          });
        } else {
          wrapper.disabled = true;
        }

        wrapper.append(keySpan, actionSpan);
        this.container!.appendChild(wrapper);
      });
  }
}
