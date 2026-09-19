import { Toggle as RadixToggle } from "radix-ui";
import { cx } from "../cx";

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
        <RadixToggle.Root
            pressed={pressed}
            onPressedChange={onPressedChange}
            title={title}
            className={cx("ark-chip", className)}
        >
            {dotColor ? <span className="ark-chip__dot" style={{ color: dotColor }} /> : null}
            {label}
            {count === undefined ? null : <span className="ark-chip__count">{count}</span>}
        </RadixToggle.Root>
    );
}
