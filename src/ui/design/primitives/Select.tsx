import { Select as RadixSelect } from "radix-ui";
import { cx } from "../cx";
import { Icon } from "./Icon";

export interface SelectOption<T extends string> {
    value: T;
    label: string;
}

export interface SelectProps<T extends string> {
    value: T;
    onValueChange: (value: T) => void;
    options: SelectOption<T>[];
    id?: string;
    title?: string;
    disabled?: boolean;
    className?: string;
}

export function Select<T extends string>({
    value,
    onValueChange,
    options,
    id,
    title,
    disabled,
    className,
}: SelectProps<T>) {
    return (
        <RadixSelect.Root value={value} onValueChange={(next) => onValueChange(next as T)} disabled={disabled}>
            <RadixSelect.Trigger id={id} title={title} className={cx("ark-select-trigger", className)}>
                <RadixSelect.Value />
                <RadixSelect.Icon className="ark-select-trigger__icon">
                    <Icon name="chevron-down" size={14} />
                </RadixSelect.Icon>
            </RadixSelect.Trigger>
            <RadixSelect.Portal>
                <RadixSelect.Content position="popper" sideOffset={4} className="ark-select-content">
                    <RadixSelect.Viewport className="ark-select-viewport">
                        {options.map((option) => (
                            <RadixSelect.Item key={option.value} value={option.value} className="ark-select-item">
                                <span className="ark-select-item__indicator">
                                    <RadixSelect.ItemIndicator>
                                        <Icon name="check" size={14} />
                                    </RadixSelect.ItemIndicator>
                                </span>
                                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                            </RadixSelect.Item>
                        ))}
                    </RadixSelect.Viewport>
                </RadixSelect.Content>
            </RadixSelect.Portal>
        </RadixSelect.Root>
    );
}
