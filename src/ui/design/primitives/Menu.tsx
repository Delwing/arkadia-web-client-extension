import type { ReactNode } from "react";
import { DropdownMenu as RadixMenu } from "radix-ui";
import { cx } from "../cx";

export interface MenuProps {
    trigger: ReactNode;
    align?: "start" | "center" | "end";
    className?: string;
    children: ReactNode;
}

export function Menu({ trigger, align = "end", className, children }: MenuProps) {
    return (
        <RadixMenu.Root>
            <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
            <RadixMenu.Portal>
                <RadixMenu.Content align={align} sideOffset={4} className={cx("ark-menu", className)}>
                    {children}
                </RadixMenu.Content>
            </RadixMenu.Portal>
        </RadixMenu.Root>
    );
}

export function MenuItem({
    onSelect,
    disabled,
    children,
}: {
    onSelect: () => void;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <RadixMenu.Item className="ark-menu__item" disabled={disabled} onSelect={onSelect}>
            {children}
        </RadixMenu.Item>
    );
}

export function MenuLabel({ children }: { children: ReactNode }) {
    return <RadixMenu.Label className="ark-menu__label">{children}</RadixMenu.Label>;
}

export function MenuSeparator() {
    return <RadixMenu.Separator className="ark-menu__separator" />;
}
