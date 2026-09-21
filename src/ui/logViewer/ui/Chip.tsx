import { cx } from "./cx";

export interface ChipProps {
    label: string;
    /** Rendered in monospace after the label; omit for a chip without a count. */
    count?: number;
    pressed: boolean;
    onPressedChange: (pressed: boolean) => void;
    /** CSS colour for the leading dot — pass a token, never a literal. */
    dotColor?: string;
    title?: string;
    className?: string;
}

/** A filter pill with its count. The log viewer's channel filters. */
export function Chip({ label, count, pressed, onPressedChange, dotColor, title, className }: ChipProps) {
    return (
        <button
            type="button"
            title={title}
            data-state={pressed ? "on" : "off"}
            onClick={() => onPressedChange(!pressed)}
            className={cx("lv-chip", className)}
        >
            {dotColor ? <span className="lv-chip__dot" style={{ color: dotColor }} /> : null}
            {label}
            {count === undefined ? null : <span className="lv-chip__count">{count}</span>}
        </button>
    );
}
