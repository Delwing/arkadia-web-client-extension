import type { ReactNode } from "react";
import { cx } from "./cx";

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
        <div className={cx("lv-empty-state", className)}>
            <span>{message}</span>
            {action}
        </div>
    );
}
