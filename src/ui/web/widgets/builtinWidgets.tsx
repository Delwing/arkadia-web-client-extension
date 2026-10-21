import { useSyncExternalStore } from "react";
import eventBus from "@modules/core/eventBus";
import { registerWidgetType, type WidgetType } from "@modules/core/widgetRegistry.ts";
import { WorldTimeClocks, type WorldTimeView } from "@web/WorldTimeView.tsx";
import ExitCompass from "../footer/ExitCompass";
import Vitals from "../footer/Vitals";

interface TransportTimer {
  label: string;
  remaining?: number | null;
  total?: number | null;
}

// The last `transportTimer`, so a transport widget added mid-journey shows it at once.
let transport: TransportTimer | null = null;
const transportListeners = new Set<() => void>();
let transportWatched = false;

function watchTransport(): void {
  if (transportWatched) return;
  transportWatched = true;
  eventBus.on("transportTimer", (payload: TransportTimer | null) => {
    transport = payload;
    transportListeners.forEach((listener) => listener());
  });
}

function subscribeTransport(listener: () => void): () => void {
  transportListeners.add(listener);
  return () => transportListeners.delete(listener);
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The leg you are travelling: where to, how long until you get there, and how far along. */
function TransportWidget() {
  const timer = useSyncExternalStore(subscribeTransport, () => transport);
  if (!timer) return null;
  const hasTime = typeof timer.remaining === "number" && typeof timer.total === "number" && timer.total > 0;
  const done = hasTime ? 1 - timer.remaining! / timer.total! : 0;
  return (
    <div className="widget-transport">
      <div className="widget-transport__row">
        <span className="widget-transport__label">{timer.label}</span>
        {hasTime && <span className="widget-transport__time">{mmss(timer.remaining!)}</span>}
      </div>
      {hasTime && (
        <div className="widget-transport__track">
          <span className="widget-transport__fill" style={{ width: `${Math.round(done * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

const BUILTIN_WIDGETS: WidgetType[] = [
  {
    id: "clock",
    label: "Zegar",
    defaultCorner: "tr",
    options: [
      {
        key: "view",
        label: "Domena",
        default: "current",
        choices: [
          { value: "current", label: "Bieżąca" },
          { value: "other", label: "Druga" },
          { value: "both", label: "Obie" },
        ],
      },
      {
        key: "dayBar",
        label: "Pasek dnia",
        default: "on",
        choices: [
          { value: "on", label: "Pokaż" },
          { value: "off", label: "Ukryj" },
        ],
      },
    ],
    render: (settings) => (
      <div className="widget-clock">
        <WorldTimeClocks view={settings.view as WorldTimeView} noDayBar={settings.dayBar === "off"} />
      </div>
    ),
  },
  {
    id: "vitals",
    label: "Witalne",
    defaultCorner: "bl",
    options: [
      {
        key: "show",
        label: "Paski",
        default: "footer",
        choices: [
          { value: "footer", label: "Jak w stopce" },
          { value: "all", label: "Wszystkie" },
        ],
      },
    ],
    render: (settings) => (
      <div className="widget-vitals">
        <Vitals showAll={settings.show === "all"} />
      </div>
    ),
  },
  {
    id: "compass",
    label: "Kompas",
    defaultCorner: "br",
    render: () => <ExitCompass />,
  },
  {
    id: "transport",
    label: "Transport",
    defaultCorner: "tl",
    render: () => <TransportWidget />,
  },
];

/** Register the built-in widgets (call once per UI that shows widgets). */
export function registerBuiltinWidgets(): void {
  watchTransport();
  for (const type of BUILTIN_WIDGETS) registerWidgetType({ ...type, source: "builtin" });
}
