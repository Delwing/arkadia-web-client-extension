import { cx } from "./cx";

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
    title?: string;
    /** An option that exists but cannot be chosen yet — still shown, so the
        control does not change width when it becomes available. */
    disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
    value: T;
    onValueChange: (value: T) => void;
    options: SegmentedOption<T>[];
    className?: string;
}

/** Mutually exclusive views — "Ten log" | "Wszystkie logi". */
export function Segmented<T extends string>({ value, onValueChange, options, className }: SegmentedProps<T>) {
    return (
        <div className={cx("lv-segmented", className)}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    title={option.title}
                    data-state={option.value === value ? "on" : "off"}
                    className="lv-segmented__item"
                    disabled={option.disabled}
                    onClick={() => onValueChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
