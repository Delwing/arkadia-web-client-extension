import type { ReactNode } from "react";
import { Tabs as RadixTabs } from "radix-ui";
import { cx } from "../cx";

export interface TabItem {
    value: string;
    label: string;
}

export interface TabsProps {
    value: string;
    onValueChange: (value: string) => void;
    items: TabItem[];
    className?: string;
    children: ReactNode;
}

export function Tabs({ value, onValueChange, items, className, children }: TabsProps) {
    return (
        <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
            <RadixTabs.List className="ark-tabs-list">
                {items.map((item) => (
                    <RadixTabs.Trigger key={item.value} value={item.value} className="ark-tabs-trigger">
                        {item.label}
                    </RadixTabs.Trigger>
                ))}
            </RadixTabs.List>
            {children}
        </RadixTabs.Root>
    );
}

export function TabPanel({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
    return (
        <RadixTabs.Content value={value} className={cx("ark-tabs-content", className)}>
            {children}
        </RadixTabs.Content>
    );
}
