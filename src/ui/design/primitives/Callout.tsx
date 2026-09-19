import type { ReactNode } from "react";
import { cx } from "../cx";

export type CalloutTone = "neutral" | "info" | "warning" | "danger";

export function Callout({
    tone = "neutral",
    icon,
    className,
    children,
}: {
    tone?: CalloutTone;
    icon?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cx("ark-callout", tone !== "neutral" && `ark-callout--${tone}`, className)}>
            {icon ? <span className="ark-callout__icon">{icon}</span> : null}
            <div>{children}</div>
        </div>
    );
}

/**
 * The "nothing here, and here is why" block. Always takes an action: an empty
 * state that only explains leaves the player stuck in whichever filter emptied
 * the view.
 */
export function EmptyState({
    message,
    action,
    className,
}: {
    message: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cx("ark-empty-state", className)}>
            <span>{message}</span>
            {action}
        </div>
    );
}
