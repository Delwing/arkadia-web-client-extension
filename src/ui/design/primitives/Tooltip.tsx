import type { ReactNode } from "react";
import { Tooltip as RadixTooltip } from "radix-ui";
import { cx } from "../cx";

export function TooltipProvider({ children }: { children: ReactNode }) {
    return <RadixTooltip.Provider delayDuration={400}>{children}</RadixTooltip.Provider>;
}

export interface TooltipProps {
    content: ReactNode;
    mono?: boolean;
    side?: "top" | "right" | "bottom" | "left";
    children: ReactNode;
}

/**
 * Wrap a control to give it a tooltip. Note that plain `title` is still the
 * right choice for most controls here — it needs no provider and is what the
 * icon buttons use; reach for this when the content is rich or must not wait
 * for the browser's delay.
 */
export function Tooltip({ content, mono, side = "top", children }: TooltipProps) {
    return (
        <RadixTooltip.Root>
            <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
            <RadixTooltip.Portal>
                <RadixTooltip.Content
                    side={side}
                    sideOffset={6}
                    className={cx("ark-tooltip", mono && "ark-tooltip--mono")}
                >
                    {content}
                    <RadixTooltip.Arrow className="ark-tooltip__arrow" />
                </RadixTooltip.Content>
            </RadixTooltip.Portal>
        </RadixTooltip.Root>
    );
}
