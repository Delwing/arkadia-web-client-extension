import type { ReactNode } from "react";
import { cx } from "../cx";

export type BadgeTone = "neutral" | "accent" | "accent-soft" | "success" | "danger";

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
            className={cx("ark-badge", `ark-badge--${tone}`, status && "ark-badge--status", className)}
        >
            {dot ? <span className={cx("ark-badge__dot", dot === "live" && "ark-badge__dot--live")} /> : null}
            {children}
        </span>
    );
}
