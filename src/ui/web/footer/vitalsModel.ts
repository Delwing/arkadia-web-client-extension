import { getColorLevel, type ColorLevel } from "@web/colors";

/** The Char.State vitals the footer knows how to show. */
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

export type VitalKey = keyof CharStateData;

export interface VitalConfig {
  max: number;
  /** The resting value; a vital at rest is hidden unless it is always shown. */
  default?: number;
  /** Higher is worse (fatigue); vitals resting at 0 are read that way too. */
  flip?: boolean;
  transform?: (value: number, max: number) => { value: number; max: number };
}

export const VITAL_LABELS: Record<VitalKey, string> = {
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

export const VITAL_EMOJI: Record<VitalKey, string> = {
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

/** Full names, for tooltips. */
export const VITAL_NAMES: Record<VitalKey, string> = {
  hp: "Kondycja",
  fatigue: "Zmeczenie",
  stuffed: "Glod",
  encumbrance: "Obciazenie",
  soaked: "Pragnienie",
  mana: "Mana",
  improve: "Postepy",
  form: "Forma",
  intox: "Upicie",
  headache: "Kac",
  panic: "Panika",
};

export const VITAL_CONFIG: Record<VitalKey, VitalConfig> = {
  // The game reports hp 0..6; players count it 1..7 (see HpTitle).
  hp: { max: 6, transform: (value, max) => ({ value: value + 1, max: max + 1 }) },
  fatigue: { max: 9, flip: true },
  stuffed: { max: 3, default: 3 },
  encumbrance: { max: 6, default: 0 },
  soaked: { max: 3, default: 3 },
  mana: { max: 8, default: 8 },
  improve: { max: 15, default: 0 },
  form: { max: 3, default: 3 },
  intox: { max: 9, default: 0 },
  headache: { max: 6, default: 0 },
  panic: { max: 4, default: 0 },
};

export const DEFAULT_VITAL_ORDER = Object.keys(VITAL_CONFIG) as VitalKey[];

export interface VitalReading {
  key: VitalKey;
  value: number;
  max: number;
  level: ColorLevel;
  /** At the far end from where it rests (starving, fully drunk…). */
  alert: boolean;
  /** Nothing reported yet (no Char.State so far): an empty meter. */
  unknown?: boolean;
}

function unknownVital(key: VitalKey): VitalReading {
  const { max, transform } = VITAL_CONFIG[key];
  return { key, value: 0, max: transform ? transform(0, max).max : max, level: "success", alert: false, unknown: true };
}

/** Normalise one reported value: transform, clamp, colour level. */
export function readVital(key: VitalKey, raw: number): VitalReading {
  const config = VITAL_CONFIG[key];
  let value = raw;
  let max = config.max;
  if (config.transform) ({ value, max } = config.transform(value, max));
  value = Math.max(0, Math.min(max, value));
  const reverse = config.default === 0 || config.flip === true;
  const opposite = config.default !== undefined ? (config.default > 0 ? 0 : max) : null;
  return {
    key,
    value,
    max,
    level: getColorLevel(value, max, reverse, key === "hp"),
    alert: opposite !== null && value === opposite,
  };
}

/**
 * The vitals to show, in the player's order: those away from their resting value,
 * plus the ones the player always wants. Form is hidden where the game says the
 * character has none (Char.Options form 0). Before the game has reported a vital,
 * the ones that would be shown anyway (no resting value, or always shown) appear
 * as empty meters, so the line has its shape from the start.
 */
export function visibleVitals(
  state: Partial<CharStateData>,
  order: string[],
  alwaysVisible: string[],
  formDisabled: boolean,
): VitalReading[] {
  const keys = (order.length > 0 ? order : DEFAULT_VITAL_ORDER)
    .filter((key): key is VitalKey => key in VITAL_CONFIG);
  return keys
    .filter((key) => {
      const value = state[key];
      const rest = VITAL_CONFIG[key].default;
      if (value === undefined) return rest === undefined || alwaysVisible.includes(key);
      if (key === "form" && value === 0 && formDisabled) return false;
      if (alwaysVisible.includes(key)) return true;
      return rest === undefined || value !== rest;
    })
    .map((key) => state[key] === undefined ? unknownVital(key) : readVital(key, state[key] as number));
}
