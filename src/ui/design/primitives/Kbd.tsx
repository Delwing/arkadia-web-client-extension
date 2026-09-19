import type { ReactNode } from "react";
import { cx } from "../cx";

/** A keycap. `bare` drops the box for hints already inside a bordered control. */
export function Kbd({ bare, children }: { bare?: boolean; children: ReactNode }) {
    return <span className={cx("ark-kbd", bare && "ark-kbd--bare")}>{children}</span>;
}
