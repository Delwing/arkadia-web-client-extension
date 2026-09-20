import { cx } from "./cx";

export function Spinner({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
    return <span className={cx("lv-spinner", size === "lg" && "lv-spinner--lg", className)} />;
}
