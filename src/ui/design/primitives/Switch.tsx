import { Switch as RadixSwitch } from "radix-ui";
import { cx } from "../cx";

export interface SwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    id?: string;
    disabled?: boolean;
    className?: string;
}

/** For settings that take effect immediately. Use a Checkbox inside a form. */
export function Switch({ checked, onCheckedChange, id, disabled, className }: SwitchProps) {
    return (
        <RadixSwitch.Root
            id={id}
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            className={cx("ark-switch", className)}
        >
            <RadixSwitch.Thumb className="ark-switch__thumb" />
        </RadixSwitch.Root>
    );
}
