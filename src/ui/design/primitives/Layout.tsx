import type { ReactNode } from "react";
import { cx } from "../cx";

type Gap = "tight" | "normal" | "loose";

const rowGap: Record<Gap, string | false> = {
    tight: "ark-row--tight",
    normal: false,
    loose: "ark-row--loose",
};

export function Row({ gap = "normal", className, children }: { gap?: Gap; className?: string; children: ReactNode }) {
    return <div className={cx("ark-row", rowGap[gap], className)}>{children}</div>;
}

export function Col({
    gap = "normal",
    className,
    children,
}: {
    gap?: "tight" | "normal";
    className?: string;
    children: ReactNode;
}) {
    return <div className={cx("ark-col", gap === "tight" && "ark-col--tight", className)}>{children}</div>;
}

/** Pushes whatever follows it to the far edge of a row. */
export function Spacer() {
    return <div className="ark-spacer" />;
}

export function Divider({ vertical }: { vertical?: boolean }) {
    return <div className={cx("ark-divider", vertical ? "ark-divider--vertical" : "ark-divider--horizontal")} />;
}
