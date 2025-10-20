import Modal from "bootstrap/js/dist/modal";
import { getCommandDispatcher, peekClient } from "./runtime/clientProvider";

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
      const client = peekClient();
      if (!client) return;
      client.enableNotifications?.();
      const dispatcher = getCommandDispatcher();
      dispatcher.sendEvent("notify", { text: "Powiadomienie za 5s" });
      setTimeout(() => {
        const latestClient = peekClient();
        latestClient?.notify?.("Test notification");
        dispatcher.sendEvent("notify", { text: "Test notification" });
      }, 5000);
    });
  }
}

document.addEventListener("DOMContentLoaded", initDebug);
