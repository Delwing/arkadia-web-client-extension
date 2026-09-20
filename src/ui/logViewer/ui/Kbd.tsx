import type { ReactNode } from "react";

/** A keycap. */
export function Kbd({ children }: { children: ReactNode }) {
    return <span className="lv-kbd">{children}</span>;
}
