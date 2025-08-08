import ArkadiaClient from "./ArkadiaClient.ts";
import { gmcp } from "@client/src/gmcp";
import { COLOR_BAR_CLASS, COLOR_TEXT, getColorLevel } from "./colors.ts";

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
  transform?: (
    value: number,
    max: number,
  ) => { value: number; max: number };
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
  hp: { label: TEXT_LABELS.hp, max: 6, transform: (value, max) => ({ value: value + 1, max: max + 1 }) },
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

export default class CharState {
  private client: typeof ArkadiaClient;
  private container: HTMLElement | null;
  private text: HTMLElement | null;
  private bars: HTMLElement | null;
  private config: Record<keyof CharStateData, CharStateConfig>;
  private state: Partial<CharStateData> = {};
  private useEmoji = false;
  private mode = 0;

  private applyMode(mode: number) {
    if (typeof mode === "number" && mode >= 0 && mode <= 3) {
      this.mode = mode;
      if (this.text && this.bars) {
        if (mode === 3) {
          this.text.style.display = "none";
          this.bars.style.display = "flex";
        } else {
          this.text.style.display = "";
          this.bars.style.display = "none";
        }
      }
      this.update({});
    }
  }

  private applyLabelMode(useEmoji: boolean) {
    this.useEmoji = useEmoji;
    const labels = useEmoji ? EMOJI_LABELS : TEXT_LABELS;
    (Object.keys(this.config) as (keyof CharStateData)[]).forEach((key) => {
      this.config[key].label = labels[key];
    });
    this.update({});
  }

  constructor(
    client: typeof ArkadiaClient,
    overrides?: Partial<
      Record<keyof CharStateData, Partial<CharStateConfig>>
    >,
  ) {
    this.client = client;
    this.container = document.getElementById("char-state");
    this.text = document.getElementById("char-state-text");
    this.bars = document.getElementById("char-state-bars");

    this.config = { ...DEFAULT_CONFIG };

    if (overrides) {
      (Object.keys(overrides) as (keyof CharStateData)[]).forEach((key) => {
        this.config[key] = { ...this.config[key], ...overrides[key]! };
      });
    }

    if (this.container) {
      (Object.keys(this.config) as (keyof CharStateData)[]).forEach((key) => {
        const attr = this.container!.getAttribute(`data-label-${key}`);
        if (attr) this.config[key].label = attr;
      });
      const emojiAttr = this.container.getAttribute('data-emoji-labels');
      if (emojiAttr) {
        this.applyLabelMode(emojiAttr === 'true' || emojiAttr === '1');
      }
      const modeAttr = this.container.getAttribute('data-footer-mode');
      if (modeAttr) {
        this.applyMode(parseInt(modeAttr));
      }
    }

    this.client.on('settings', (ev: any) => {
      if (typeof ev.detail?.emojiLabels === 'boolean') {
        this.applyLabelMode(ev.detail.emojiLabels);
      }
      if (typeof ev.detail?.footerMode === 'number') {
        this.applyMode(ev.detail.footerMode);
      }
    });

    const ext: any = (window as any).clientExtension;
    if (ext?.addEventListener) {
      ext.addEventListener('uiSettings', (ev: CustomEvent) => {
        if (typeof ev.detail?.emojiLabels === 'boolean') {
          this.applyLabelMode(ev.detail.emojiLabels);
        }
        if (typeof ev.detail?.footerMode === 'number') {
          this.applyMode(ev.detail.footerMode);
        }
      });
    }

    this.client.on(
      "gmcp.char.state",
      (state: Partial<CharStateData>) => this.update(state),
    );
  }

  private update(partialState: Partial<CharStateData>) {
    if (!this.container || !this.text) return;

    this.state = { ...this.state, ...partialState };

    const entries = (Object.keys(this.config) as (keyof CharStateData)[])
      .filter((key) => {
        if (
          key === 'form' &&
          this.state[key] === 0 &&
          gmcp.char?.options?.form === 0
        ) {
          return false;
        }
        return (
          this.state[key] !== undefined &&
          (this.config[key].default === undefined ||
            this.state[key] !== this.config[key].default)
        );
      });
    if (this.mode === 3 && this.bars) {
      this.bars.innerHTML = "";
      entries.forEach((key) => {
        let value = this.state[key] as number;
        const { max, label, transform, default: def } = this.config[key];
        let maxValue = max;
        if (transform && typeof value === "number") {
          ({ value, max: maxValue } = transform(value, maxValue));
        }
        value = Math.max(0, Math.min(maxValue, value));
        const ratio = value / maxValue;
        const reverse = def === 0 || this.config[key].flip === true;
        const colorLevel = getColorLevel(value, maxValue, reverse, key === "hp");
        const colorClass = COLOR_BAR_CLASS[colorLevel];
        const opposite =
          def !== undefined ? (def > 0 ? 0 : maxValue) : null;
        const highlight = opposite !== null && value === opposite;

        const group = document.createElement("div");
        group.className = "char-state-bar";
        group.title = key;
        const labelEl = document.createElement("span");
        labelEl.textContent = label + ":";
        if (highlight) labelEl.style.color = "tomato";
        const progress = document.createElement("div");
        progress.className = "progress position-relative";
        const bar = document.createElement("div");
        bar.className = `progress-bar ${colorClass}`;
        bar.style.width = `${Math.floor(ratio * 100)}%`;
        const valueSpan = document.createElement("span");
        valueSpan.className = "progress-value";
        valueSpan.textContent = `${value}/${maxValue}`;
        valueSpan.style.color = "white";
        progress.appendChild(bar);
        progress.appendChild(valueSpan);
        group.appendChild(labelEl);
        group.appendChild(progress);
        this.bars!.appendChild(group);
      });
      this.text.innerHTML = "";
      return;
    }

    this.text.innerHTML = entries
      .map((key) => {
        let value = this.state[key] as number;
        const { max, label, transform, default: def } = this.config[key];
        let maxValue = max;
        if (transform && typeof value === "number") {
          ({ value, max: maxValue } = transform(value, maxValue));
        }
        value = Math.max(0, Math.min(maxValue, value));
        const opposite = def !== undefined ? (def > 0 ? 0 : maxValue) : null;
        const highlight = opposite !== null && value === opposite;
        const reverse = def === 0 || this.config[key].flip === true;
        const colorLevel = getColorLevel(value, maxValue, reverse, key === "hp");
        const color = COLOR_TEXT[colorLevel];
        let text = "";
        if (this.mode === 1 || this.mode === 2) {
          const barMax = this.mode === 2 ? 10 : maxValue;
          const filledLen = Math.round((value / maxValue) * barMax);
          const emptyLen = barMax - filledLen;
          const bar = "#".repeat(filledLen) + "-".repeat(emptyLen);
          text = `${label}: <span style="color:${color}">[${bar}]</span>`;
        } else {
          text = `${label}: <span style="color:${color}">[${value}/${maxValue}]</span>`;
        }
        return highlight ? `<span style="color:tomato">${text}</span>` : text;
      })
      .join(' ');
  }
}
