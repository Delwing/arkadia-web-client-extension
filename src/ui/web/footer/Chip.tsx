import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import "./chip.css";

export type ChipTone = "ok" | "warn" | "danger";

/** How long a chip must be held before its long-press action fires. */
export const CHIP_LONG_PRESS_MS = 300;

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
 *
 * A chip with `onLongPress` also reacts to being held: while the press is down
 * it carries `chip--holding` (hosts animate a fill over `--chip-hold-ms`), and
 * once the hold completes it fires the action, buzzes the phone, flashes
 * `chip--held` and swallows the click that the release would otherwise send.
 *
 * A chip whose values are a known set (OK / a countdown, on / off) passes them as
 * `sizeTo`: they are laid invisibly under the real value in one grid cell, so the
 * chip is as wide as its widest state and never resizes as the value changes.
 * It is a floor, not a cap: a value longer than every candidate still grows it.
 * Digits are tabular there, so "8.8" stands for any one-decimal countdown.
 */
export function Chip({ icon, label, labelColor, labelSizeTo, value, sizeTo, valueFirst, tone, onClick, onLongPress, title, className }: {
  icon: ReactNode;
  label: string;
  /** Tints the label (the clock chip colours its season name). */
  labelColor?: string;
  /** Like `sizeTo`, for a label that changes (the clock's season). */
  labelSizeTo?: readonly string[];
  value: ReactNode;
  /** Every shape the value can take, widest wins; the chip reserves that width. */
  sizeTo?: readonly string[];
  /** The value leads and the label follows it ("14:32 dzien"). */
  valueFirst?: boolean;
  tone?: ChipTone;
  onClick?: () => void;
  onLongPress?: () => void;
  title?: string;
  className?: string;
}) {
  const hold = useLongPress(onLongPress);
  const cls = [
    "chip", tone && `chip--${tone}`, (onClick || onLongPress) && "chip--act",
    hold.state === "holding" && "chip--holding", hold.state === "held" && "chip--held", className,
  ].filter(Boolean).join(" ");
  const inner = (
    <>
      {icon}
      <span className="chip__text">
        {valueFirst && <Sized className="chip__val" sizeTo={sizeTo}>{value}</Sized>}
        {label && <Sized className="chip__lab" style={labelColor ? { color: labelColor } : undefined} sizeTo={labelSizeTo}>{label}</Sized>}
        {!valueFirst && <Sized className="chip__val" sizeTo={sizeTo}>{value}</Sized>}
      </span>
    </>
  );
  if (!onClick && !onLongPress) return <div className={cls} title={title}>{inner}</div>;
  return (
    <button
      type="button"
      className={cls}
      title={title}
      style={onLongPress ? ({ "--chip-hold-ms": `${CHIP_LONG_PRESS_MS}ms` } as CSSProperties) : undefined}
      {...hold.handlers}
      onClick={() => { if (!hold.consumeFired()) onClick?.(); }}
    >
      {inner}
    </button>
  );
}

/**
 * A value or label, sized to its widest `sizeTo` candidate when it has them
 * (chip.css). The candidates are empty spans drawn by ::before, so textContent
 * stays the text itself.
 */
function Sized({ className, style, sizeTo, children }: {
  className: string;
  style?: CSSProperties;
  sizeTo?: readonly string[];
  children: ReactNode;
}) {
  if (!sizeTo) return <span className={className} style={style}>{children}</span>;
  return (
    <span className={`${className} chip__sized`} style={style}>
      {sizeTo.map((size) => <span key={size} data-size={size} />)}
      <span>{children}</span>
    </span>
  );
}

type HoldState = "idle" | "holding" | "held";

function useLongPress(onLongPress: (() => void) | undefined) {
  const [state, setState] = useState<HoldState>("idle");
  const timer = useRef<number | null>(null);
  const flash = useRef<number | null>(null);
  const fired = useRef(false);
  const action = useRef(onLongPress);
  action.current = onLongPress;

  const clear = () => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
  };
  useEffect(() => () => {
    clear();
    if (flash.current !== null) window.clearTimeout(flash.current);
  }, []);

  const cancel = () => {
    if (timer.current === null) return;
    clear();
    setState("idle");
  };

  const handlers = onLongPress ? {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      clear();
      setState("holding");
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        navigator.vibrate?.(40);
        action.current?.();
        setState("held");
        if (flash.current !== null) window.clearTimeout(flash.current);
        flash.current = window.setTimeout(() => setState("idle"), 400);
      }, CHIP_LONG_PRESS_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // A held touch opens the context menu / callout on phones — the hold is ours.
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  } : {};

  /** True (once) when the click that follows a completed hold should be ignored. */
  const consumeFired = () => {
    const was = fired.current;
    fired.current = false;
    return was;
  };

  return { state, handlers, consumeFired };
}
