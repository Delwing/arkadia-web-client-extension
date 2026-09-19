import { Checkbox as RadixCheckbox } from "radix-ui";
import { cx } from "../cx";
import { Icon } from "./Icon";

export interface CheckboxProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    id?: string;
    disabled?: boolean;
    className?: string;
}

export function Checkbox({ checked, onCheckedChange, id, disabled, className }: CheckboxProps) {
    return (
        <RadixCheckbox.Root
            id={id}
            checked={checked}
            onCheckedChange={(next) => onCheckedChange(next === true)}
            disabled={disabled}
            className={cx("ark-checkbox", className)}
        >
            <RadixCheckbox.Indicator>
                <Icon name="check" size={12} />
            </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>
    );
}
