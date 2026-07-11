import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {useClientEvent, useLocalStorage} from "../../hooks";
import { COLOR_BAR_CLASS, COLOR_TEXT, getColorLevel } from "@web/colors";
import {UiSettings} from "@web/uiSettings.ts";
import {globalStorage} from "@modules/core/storage";
import {getMapSettings, onMapSettingsChange} from "@modules/core/settings";

export interface CharStateData {
  hp: number;
  mana: number;
  fatigue: number;
  improve: number;
  form: number;
  intox: number;
  headache: number;
  stuffed: number;
  soaked: number;
  encumbrance: number;
  panic: number;
}

export interface CharStateConfig {
  label: string;
  max: number;
  default?: number;
  flip?: boolean;
  transform?: (value: number, max: number) => { value: number; max: number };
}

interface CharOptions {
  form?: number;
}

const TEXT_LABELS: Record<keyof CharStateData, string> = {
  hp: "HP",
  fatigue: "ZM",
  stuffed: "GLO",
  encumbrance: "OBC",
  soaked: "PRA",
  mana: "MANA",
  improve: "POS",
  form: "FOR",
  intox: "UPI",
  headache: "KAC",
  panic: "PAN",
};

const EMOJI_LABELS: Record<keyof CharStateData, string> = {
  hp: "❤",
  fatigue: "💤",
  stuffed: "🍞",
  encumbrance: "🎒",
  soaked: "💧",
  mana: "🔮",
  improve: "⭐",
  form: "💪",
  intox: "🍺",
  headache: "🤕",
  panic: "😱",
};

const DEFAULT_CONFIG: Record<keyof CharStateData, CharStateConfig> = {
  hp: {
    label: TEXT_LABELS.hp,
    max: 6,
    transform: (value, max) => ({ value: value + 1, max: max + 1 }),
  },
  fatigue: { label: TEXT_LABELS.fatigue, max: 9, flip: true },
  stuffed: { label: TEXT_LABELS.stuffed, max: 3, default: 3 },
  encumbrance: { label: TEXT_LABELS.encumbrance, max: 6, default: 0 },
  soaked: { label: TEXT_LABELS.soaked, max: 3, default: 3 },
  mana: { label: TEXT_LABELS.mana, max: 8, default: 8 },
  improve: { label: TEXT_LABELS.improve, max: 15, default: 0 },
  form: { label: TEXT_LABELS.form, max: 3, default: 3 },
  intox: { label: TEXT_LABELS.intox, max: 9, default: 0 },
  headache: { label: TEXT_LABELS.headache, max: 6, default: 0 },
  panic: { label: TEXT_LABELS.panic, max: 4, default: 0 },
};

/**
 * CharState component - displays character state with multiple modes
 * Modes: 0=text, 1=text bar, 2=compact bar, 3=progress bars
 * Supports emoji/text labels and per-stat configuration
 *
 * This component uses React Portals to render into the existing DOM structure:
 * - Text mode (0, 1, 2) renders to #char-state-text
 * - Bars mode (3) renders to #char-state-bars
 */
export const CharState: React.FC = () => {
  const [state, setState] = useState<Partial<CharStateData>>({});
  const [options, setOptions] = useState<CharOptions>({});
  const [uiSettings] = useLocalStorage<Partial<UiSettings>>("uiSettings", {});
  const [mode, setMode] = useState(() => {
    return uiSettings.footerMode || 0;
  });
  const [useEmoji, setUseEmoji] = useState(() => {
    return getMapSettings().emojiLabels;
  });
  const [alwaysVisibleBarsState, setAlwaysVisibleBarsState] = useState<string[]>(() => {
    return uiSettings.alwaysVisibleBars || [];
  });
  const [barOrderState, setBarOrderState] = useState<string[]>(() => {
    return (uiSettings.barOrder && uiSettings.barOrder.length > 0) ? uiSettings.barOrder : [];
  });
  const [config, setConfig] = useState<Record<keyof CharStateData, CharStateConfig>>(
      { ...DEFAULT_CONFIG }
  );

  const [textContainer, setTextContainer] = useState<HTMLElement | null>(null);
  const [barsContainer, setBarsContainer] = useState<HTMLElement | null>(null);

  // Find the DOM containers on mount
  useEffect(() => {
    setTextContainer(document.getElementById("char-state-text"));
    setBarsContainer(document.getElementById("char-state-bars"));
  }, []);

  // Update config labels when emoji mode changes
  useEffect(() => {
    const labels = useEmoji ? EMOJI_LABELS : TEXT_LABELS;
    const newConfig = { ...config };
    (Object.keys(newConfig) as (keyof CharStateData)[]).forEach((key) => {
      newConfig[key] = { ...newConfig[key], label: labels[key] };
    });
    setConfig(newConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional read-then-update pattern
  }, [useEmoji]);

  useClientEvent<Partial<CharStateData>>("gmcp.char.state", (newState) => {
    setState((prev) => ({ ...prev, ...newState }));
  });

  useClientEvent<CharOptions>("gmcp.char.options", (newOptions) => {
    setOptions((prev) => ({ ...prev, ...newOptions }));
  });

  useEffect(() => {
    // emojiLabels now lives in mapSettings; footerMode/alwaysVisibleBars/barOrder
    // stay in the uiSettings (chrome) blob.
    const unsubscribeChrome = globalStorage.onChange('uiSettings', (detail) => {
      if (detail && typeof detail.footerMode === "number") {
        setMode(detail.footerMode);
      }
      if (detail && Array.isArray(detail.alwaysVisibleBars)) {
        setAlwaysVisibleBarsState(detail.alwaysVisibleBars);
      }
      if (detail && Array.isArray(detail.barOrder) && detail.barOrder.length > 0) {
        setBarOrderState(detail.barOrder);
      }
    });
    const unsubscribeMap = onMapSettingsChange((map) => {
      setUseEmoji(map.emojiLabels);
    });
    return () => { unsubscribeChrome(); unsubscribeMap(); };
  }, []);

  // Control visibility of text/bars containers based on mode
  useEffect(() => {
    if (textContainer && barsContainer) {
      if (mode === 3) {
        textContainer.style.display = "none";
        barsContainer.style.display = "flex";
      } else {
        textContainer.style.display = "";
        barsContainer.style.display = "none";
      }
    }
  }, [mode, textContainer, barsContainer]);

  const alwaysVisibleBars: string[] = alwaysVisibleBarsState;
  const defaultOrder = Object.keys(DEFAULT_CONFIG) as (keyof CharStateData)[];
  const barOrder: (keyof CharStateData)[] = barOrderState.length > 0
      ? barOrderState as (keyof CharStateData)[]
      : defaultOrder;

  // Filter entries that should be displayed
  const visibleEntries = barOrder.filter((key) => !!(config as any)[key]).filter((key) => {
    if (key === "form" && state[key] === 0 && options.form === 0) {
      return false;
    }
    if (state[key] === undefined) return false;
    if (alwaysVisibleBars.includes(key)) return true;
    return (
        config[key].default === undefined || state[key] !== config[key].default
    );
  });

  // Calculate normalized stat values and metadata
  const getStatData = (key: keyof CharStateData) => {
    let value = state[key] as number;
    const { max, label, transform, default: def, flip } = config[key];
    let maxValue = max;

    if (transform && typeof value === "number") {
      ({ value, max: maxValue } = transform(value, maxValue));
    }

    value = Math.max(0, Math.min(maxValue, value));
    const ratio = value / maxValue;
    const reverse = def === 0 || flip === true;
    const colorLevel = getColorLevel(value, maxValue, reverse, key === "hp");
    const opposite = def !== undefined ? (def > 0 ? 0 : maxValue) : null;
    const highlight = opposite !== null && value === opposite;

    return { value, maxValue, ratio, label, colorLevel, highlight };
  };

  // Generate bar visualization string
  const getBarString = (ratio: number, maxValue: number, mode: number) => {
    if (mode === 1) {
      const filled = Math.round(ratio * maxValue);
      return "#".repeat(filled) + "-".repeat(maxValue - filled);
    } else {
      const filled = Math.round(ratio * 10);
      return "#".repeat(filled) + "-".repeat(10 - filled);
    }
  };

  // Render progress bars (mode 3)
  const renderBars = () => {
    if (!barsContainer) return null;

    return createPortal(
        <>
          {visibleEntries.map((key) => {
            const { value, maxValue, ratio, label, colorLevel, highlight } = getStatData(key);
            const colorClass = COLOR_BAR_CLASS[colorLevel];

            return (
                <div key={key} className="char-state-bar" title={key}>
                  <span style={{ color: highlight ? "tomato" : "white" }}>{label}:</span>
                  <div className="progress position-relative">
                    <div
                        className={`progress-bar ${colorClass}`}
                        style={{ width: `${Math.floor(ratio * 100)}%` }}
                    />
                    <span className="progress-value" style={{ color: "white" }}>
                  {value}/{maxValue}
                </span>
                  </div>
                </div>
            );
          })}
        </>,
        barsContainer
    );
  };

  // Render text mode (modes 0, 1, 2)
  const renderText = () => {
    if (!textContainer) return null;

    return createPortal(
        <>
          {visibleEntries.map((key, idx) => {
            const { value, maxValue, ratio, label, colorLevel, highlight } = getStatData(key);
            const color = COLOR_TEXT[colorLevel];

            const content =
                mode === 1 || mode === 2 ? (
                    <>
                      <span style={{ color: "white" }}>{label}: </span>
                      <span style={{ color }}>[{getBarString(ratio, maxValue, mode)}]</span>
                    </>
                ) : (
                    <>
                      <span style={{ color: "white" }}>{label}: </span>
                      <span style={{ color }}>
                  [{value}/{maxValue}]
                </span>
                    </>
                );

            return (
                <span key={key}>
              {idx > 0 && " "}
                  {highlight ? <span style={{ color: "tomato" }}>{content}</span> : content}
            </span>
            );
          })}
        </>,
        textContainer
    );
  };

  return <>{mode === 3 ? renderBars() : renderText()}</>;
};

export default CharState;