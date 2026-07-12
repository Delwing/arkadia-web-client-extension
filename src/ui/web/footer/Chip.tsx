import type { ReactNode } from "react";

export type ChipTone = "ok" | "warn" | "danger";

/**
 * One footer status chip — a leading glyph, an uppercase label and a value.
 *
 * Presentational and theme-agnostic: it only emits semantic class names
 * (`chip`, `chip__ico`, `chip__text`, `chip__lab`, `chip__val`, the
 * `chip--{tone}` urgency modifier and `chip--act` for interactive chips). Each
 * host UI skins those classes — the forge HUD gives them the forged-stone look,
 * the stock UI can give them its own. Renders a `<button>` when it does
 * something on click and a plain `<div>` otherwise, so only interactive chips
 * present themselves as clickable.
 */
export function Chip({ icon, label, value, tone, onClick, title }: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: ChipTone;
  onClick?: () => void;
  title?: string;
}) {
  const cls = ["chip", tone && `chip--${tone}`, onClick && "chip--act"].filter(Boolean).join(" ");
  const inner = (
    <>
      {icon}
      <span className="chip__text">
        <span className="chip__lab">{label}</span>
        <span className="chip__val">{value}</span>
      </span>
    </>
  );
  return onClick
    ? <button type="button" className={cls} title={title} onClick={onClick}>{inner}</button>
    : <div className={cls} title={title}>{inner}</div>;
}
