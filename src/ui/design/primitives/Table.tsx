import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cx } from "../cx";

/** How a cell is laid out. `align` here replaces HTML's own deprecated
 *  `align` attribute, which is why the base props omit it. */
export type TableCellAlign = "num" | "center" | "grow";

export interface TableProps {
    /** Tighter padding and smaller type, for long report bodies. */
    compact?: boolean;
    /** Alternating row tint. Off by default: it fights a row tinted by data. */
    zebra?: boolean;
    /** Highlight the row under the pointer. Use when rows are clickable. */
    hoverable?: boolean;
    className?: string;
    children: ReactNode;
}

/**
 * A dense data table.
 *
 * Wrap it in `TableScroll` to get a body that scrolls under a header that
 * stays put — the header is sticky on its own, but it needs a scroll container
 * to be sticky inside.
 */
export function Table({ compact, zebra, hoverable, className, children }: TableProps) {
    return (
        <table
            className={cx(
                "ark-table",
                compact && "ark-table--compact",
                zebra && "ark-table--zebra",
                hoverable && "ark-table--hoverable",
                className,
            )}
        >
            {children}
        </table>
    );
}

export function TableScroll({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={cx("ark-table-scroll", className)}>{children}</div>;
}

export interface TableRowProps {
    /** Sums or closes the rows above it: ruled off and set in full contrast. */
    total?: boolean;
    selected?: boolean;
    /** A caption row between groups of rows. */
    section?: boolean;
    onClick?: () => void;
    title?: string;
    className?: string;
    children: ReactNode;
}

export function TableRow({ total, selected, section, onClick, title, className, children }: TableRowProps) {
    return (
        <tr
            onClick={onClick}
            title={title}
            className={cx(
                total && "ark-table__row--total",
                selected && "ark-table__row--selected",
                section && "ark-table__section",
                className,
            )}
        >
            {children}
        </tr>
    );
}

type CellTone = "strong" | "muted";

function cellClass(align?: TableCellAlign, tone?: CellTone, className?: string) {
    return cx(align && `ark-table__cell--${align}`, tone && `ark-table__cell--${tone}`, className);
}

export interface TableCellProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, "className" | "align"> {
    align?: TableCellAlign;
    tone?: CellTone;
    className?: string;
    children?: ReactNode;
}

export function TableCell({ align, tone, className, children, ...rest }: TableCellProps) {
    return (
        <td {...rest} className={cellClass(align, tone, className)}>
            {children}
        </td>
    );
}

export interface TableHeadCellProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, "className" | "align"> {
    align?: TableCellAlign;
    /** A row header (names the row) rather than a column header. */
    row?: boolean;
    className?: string;
    children?: ReactNode;
}

export function TableHeadCell({ align, row, className, children, ...rest }: TableHeadCellProps) {
    return (
        <th
            {...rest}
            scope={row ? "row" : "col"}
            className={cellClass(align, undefined, cx(row && "ark-table__cell--head", className))}
        >
            {children}
        </th>
    );
}
