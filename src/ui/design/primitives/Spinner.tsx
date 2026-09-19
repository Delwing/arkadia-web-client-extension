import { cx } from "../cx";

export function Spinner({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
    return <span className={cx("ark-spinner", size === "lg" && "ark-spinner--lg", className)} />;
}
