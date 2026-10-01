import { Toggle } from "../ui";
import { formatClock, pluralLines } from "../model/format";

export interface StatusBarProps {
    shownLines: number;
    totalLines: number;
    viewport: { from: number; to: number } | null;
    /** Last export failure, if any — shown here rather than in an alert(). */
    error?: string;
    live: boolean;
    follow: boolean;
    onFollowChange: (value: boolean) => void;
}

/**
 * What is on screen, and following a live log.
 *
 * The display switches that used to line this bar are in the "Widok" menu, and
 * the range is shown next to the search it narrows — see `SearchBar`.
 */
export function StatusBar({ shownLines, totalLines, viewport, error, live, follow, onFollowChange }: StatusBarProps) {
    return (
        <div className="lv-status">
            <span className="lv-status__lines">
                {shownLines === totalLines
                    ? `${totalLines} ${pluralLines(totalLines)}`
                    : `${shownLines} z ${totalLines} ${pluralLines(totalLines)}`}
            </span>
            {viewport ? (
                <span className="lv-status__view lv-hide-narrow">
                    W widoku {formatClock(viewport.from)} {"–"} {formatClock(viewport.to)}
                </span>
            ) : null}
            {error ? <span className="lv-status__error">{error}</span> : null}

            <div className="lv-spacer" />

            {live ? (
                <Toggle pressed={follow} onPressedChange={onFollowChange} title="Przewijaj do nowych linii">
                    <span className="lv-hide-narrow">{follow ? "Śledzi na żywo" : "Śledź na żywo"}</span>
                    <span className="lv-only-narrow">Na żywo</span>
                </Toggle>
            ) : null}
        </div>
    );
}
