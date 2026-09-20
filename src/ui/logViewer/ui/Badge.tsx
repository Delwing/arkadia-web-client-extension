import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "accent" | "accent-soft" | "success";

export interface BadgeProps {
    tone?: BadgeTone;
    /** Wider, letter-spaced treatment for state words like "NAGRYWANIE". */
    status?: boolean;
    /** Leading dot; `live` tints it with the success colour. */
    dot?: boolean | "live";
    title?: string;
    className?: string;
    children: ReactNode;
}

export function Badge({ tone = "neutral", status, dot, title, className, children }: BadgeProps) {
    return (
        <span
            title={title}
            className={cx("lv-badge", `lv-badge--${tone}`, status && "lv-badge--status", className)}
        >
            {dot ? <span className={cx("lv-badge__dot", dot === "live" && "lv-badge__dot--live")} /> : null}
            {children}
        </span>
    );
}
