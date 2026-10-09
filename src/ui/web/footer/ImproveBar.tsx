import type { CSSProperties } from "react";
import { useCharState } from "./charStateStore";
import { PREVIEW_CHAR_STATE, useFooterPreview } from "./layout/previewContext";
import { readVital, VITAL_NAMES } from "./vitalsModel";

/**
 * Postępy as an experience bar: one tick per point toward the next improve,
 * as wide as it is given. Hidden until the game has reported the value.
 */
export default function ImproveBar() {
  const live = useCharState().improve;
  const preview = useFooterPreview();
  const raw = live ?? (preview ? PREVIEW_CHAR_STATE.improve : undefined);
  if (typeof raw !== "number") return null;

  const { value, max } = readVital("improve", raw);
  return (
    <div className="improve-bar" title={`${VITAL_NAMES.improve} ${value}/${max}`} style={{ "--improve-max": max } as CSSProperties}>
      <span className="improve-label">{VITAL_NAMES.improve}</span>
      <span className="improve-track">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < value ? "improve-seg on" : "improve-seg"} />
        ))}
      </span>
      <span className="improve-value">{value}/{max}</span>
    </div>
  );
}
