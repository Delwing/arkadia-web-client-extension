import { useEffect, useState } from "react";
import { globalStorage } from "@modules/core/storage";
import { getMapSettings, onMapSettingsChange } from "@modules/core/settings";
import { useClientEvent } from "../hooks";
import { VITAL_EMOJI, VITAL_LABELS, VITAL_NAMES, visibleVitals, type CharStateData, type VitalReading } from "./vitalsModel";

/**
 * `uiSettings.footerMode` (Stopka → Tryb stopki):
 * 0 Liczbowy "6/7" · 1 Pasek "[######-]" one mark per point · 2 Pasek jednolity,
 * the same on a fixed 10 · 3 Pasek graficzny, a thin meter with the numbers ·
 * 4 Kafelki, one pip per point (the default).
 */
export type VitalsMode = 0 | 1 | 2 | 3 | 4;

function readLayout(): { order: string[]; always: string[]; mode: VitalsMode } {
  const settings = globalStorage.get("uiSettings") as {
    barOrder?: string[];
    alwaysVisibleBars?: string[];
    footerMode?: number;
  } | null;
  const mode = settings?.footerMode;
  return {
    order: Array.isArray(settings?.barOrder) ? settings.barOrder : [],
    always: Array.isArray(settings?.alwaysVisibleBars) ? settings.alwaysVisibleBars : [],
    mode: typeof mode === "number" && mode >= 0 && mode <= 4 ? (mode as VitalsMode) : 4,
  };
}

function Meter({ reading, mode }: { reading: VitalReading; mode: VitalsMode }) {
  const { value, max } = reading;
  if (mode === 4) {
    return (
      <span className="vital__pips" style={{ "--pips": max } as React.CSSProperties}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < value ? "vital__pip is-on" : "vital__pip"} />
        ))}
      </span>
    );
  }
  if (mode === 3) {
    return (
      <span className="vital__bar">
        <span className="vital__bar-fill" style={{ width: `${Math.round((value / max) * 100)}%` }} />
        <span className="vital__bar-value">{reading.unknown ? "–" : value}/{max}</span>
      </span>
    );
  }
  if (mode === 1 || mode === 2) {
    const length = mode === 1 ? max : 10;
    const filled = Math.round((value / max) * length);
    return <span className="vital__text">[{"#".repeat(filled)}{"-".repeat(length - filled)}]</span>;
  }
  return <span className="vital__text">{reading.unknown ? "–" : value}/{max}</span>;
}

/**
 * Char.State vitals, drawn the way the player chose (see {@link VitalsMode}) and
 * coloured by how bad they are (getColorLevel). A vital at its resting value is
 * left out unless the player keeps it on (Stopka → Kolejnosc i widocznosc paskow),
 * so the row only speaks up when something changed.
 */
export default function Vitals() {
  const [state, setState] = useState<Partial<CharStateData>>({});
  const [formDisabled, setFormDisabled] = useState(false);
  const [layout, setLayout] = useState(readLayout);
  const [emoji, setEmoji] = useState(() => getMapSettings().emojiLabels);

  useClientEvent<Partial<CharStateData>>("gmcp.char.state", (next) => setState((prev) => ({ ...prev, ...next })));
  useClientEvent<{ form?: number }>("gmcp.char.options", (options) => {
    if (options && "form" in options) setFormDisabled(options.form === 0);
  });
  useEffect(() => {
    const offChrome = globalStorage.onChange("uiSettings", () => setLayout(readLayout()));
    const offMap = onMapSettingsChange((map) => setEmoji(map.emojiLabels));
    return () => { offChrome(); offMap(); };
  }, []);

  const vitals = visibleVitals(state, layout.order, layout.always, formDisabled);
  return (
    <>
      {vitals.map((reading) => (
        <span
          key={reading.key}
          className={`vital vital--${reading.level}${reading.alert ? " vital--alert" : ""}${reading.unknown ? " vital--unknown" : ""}`}
          data-vital={reading.key}
          data-mode={layout.mode}
          title={reading.unknown ? `${VITAL_NAMES[reading.key]}: brak danych z gry` : `${VITAL_NAMES[reading.key]}: ${reading.value}/${reading.max}`}
        >
          <span className="vital__label">{emoji ? VITAL_EMOJI[reading.key] : VITAL_LABELS[reading.key]}</span>
          <Meter reading={reading} mode={layout.mode} />
        </span>
      ))}
    </>
  );
}
