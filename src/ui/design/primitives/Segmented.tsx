import { cx } from "../cx";

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
    title?: string;
}

export interface SegmentedProps<T extends string> {
    value: T;
    onValueChange: (value: T) => void;
    options: SegmentedOption<T>[];
    className?: string;
}

/**
 * Mutually exclusive views — "Ten log" | "Wszystkie logi".
 *
 * Not Radix ToggleGroup: this is a radio, not a set of toggles, and the
 * one-of-N semantics are simpler to keep honest with plain buttons than with a
 * toggle group that can legally be empty.
 */
export function Segmented<T extends string>({ value, onValueChange, options, className }: SegmentedProps<T>) {
    return (
        <div className={cx("ark-segmented", className)}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    title={option.title}
                    data-state={option.value === value ? "on" : "off"}
                    className="ark-segmented__item"
                    onClick={() => onValueChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
