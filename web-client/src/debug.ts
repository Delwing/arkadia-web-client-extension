import Modal from "bootstrap/js/dist/modal";

function initDebug() {
  const debugButton = document.getElementById("debug-button") as HTMLButtonElement | null;
  const modalEl = document.getElementById("debug-modal") as HTMLElement | null;
  if (!debugButton || !modalEl) return;

  const modal = new Modal(modalEl);
  const content = modalEl.querySelector("#debug-content") as HTMLElement;
  const scheduleButton = modalEl.querySelector("#notification-schedule-button") as HTMLButtonElement | null;

  const methods: Array<keyof Console> = ["log", "error", "warn", "info"];
  methods.forEach((m) => {
    const original = (console as any)[m].bind(console);
    (console as any)[m] = (...args: unknown[]) => {
      const msg = args
        .map((a) => {
          if (typeof a === "object") {
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          }
          return String(a);
        })
        .join(" ");
      const el = document.createElement("pre");
      el.className = "mb-0";
      el.textContent = `[${m}] ${msg}`;
      content.appendChild(el);
      content.scrollTop = content.scrollHeight;
      original(...args);
    };
  });

  debugButton.addEventListener("click", () => {
    modal.show();
  });

  if (scheduleButton) {
    scheduleButton.addEventListener("click", () => {
      const client = (window as any).clientExtension;
      if (!client) return;
      client.enableNotifications?.();
      client.sendEvent?.("notify", { text: "Powiadomienie za 5s" });
      setTimeout(() => {
        client.notify?.("Test notification");
        client.sendEvent?.("notify", { text: "Test notification" });
      }, 5000);
    });
  }
}

document.addEventListener("DOMContentLoaded", initDebug);
