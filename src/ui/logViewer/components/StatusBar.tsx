import { Button, Icon, Toggle } from "../ui";
import { formatClock, pluralLines } from "../model/format";
import type { TimeRange } from "../model/types";

export interface StatusBarProps {
    shownLines: number;
    totalLines: number;
    viewport: { from: number; to: number } | null;
    /** The selected slice, shown with a way to clear it. */
    range: TimeRange | null;
    /** False while the slice is selected but not narrowing the log — see `appliedRange`. */
    rangeActive: boolean;
    onClearRange: () => void;
    /** Last export failure, if any — shown here rather than in an alert(). */
    error?: string;
    showTimestamps: boolean;
    onShowTimestampsChange: (value: boolean) => void;
    showMeta: boolean;
    onShowMetaChange: (value: boolean) => void;
    showColors: boolean;
    onShowColorsChange: (value: boolean) => void;
    /** Only offered when the session actually stores the game's colours. */
    colorsAvailable: boolean;
    wrap: boolean;
    onWrapChange: (value: boolean) => void;
    live: boolean;
    follow: boolean;
    onFollowChange: (value: boolean) => void;
}

export function StatusBar({
    shownLines,
    totalLines,
    viewport,
    range,
    rangeActive,
    onClearRange,
    error,
    showTimestamps,
    onShowTimestampsChange,
    showMeta,
    onShowMetaChange,
    showColors,
    onShowColorsChange,
    colorsAvailable,
    wrap,
    onWrapChange,
    live,
    follow,
    onFollowChange,
}: StatusBarProps) {
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
            {range ? (
                <span
                    className="lv-range-chip"
                    data-active={rangeActive}
                    title={
                        rangeActive
                            ? "Zakres zawęża log, wyszukiwanie i eksport"
                            : "Zakres jest zaznaczony, ale nie zawęża logu — wybierz zasięg „Zakres”"
                    }
                >
                    zakres {formatClock(range.from)} {"–"} {formatClock(range.to)}
                    <Button variant="ghost" size="sm" onClick={onClearRange} title="Wyczyść zakres">
                        <Icon name="close" size={12} />
                    </Button>
                </span>
            ) : null}
            {error ? <span className="lv-status__error">{error}</span> : null}

            <div className="lv-spacer" />

            <Toggle pressed={showTimestamps} onPressedChange={onShowTimestampsChange} title="Pokaż godziny">
                <span className="lv-hide-narrow">Godziny</span>
                <span className="lv-only-narrow">Czas</span>
            </Toggle>
            <Toggle
                pressed={showMeta}
                onPressedChange={onShowMetaChange}
                title="Pokaż numer linii i typ wiadomości"
            >
                <span className="lv-hide-narrow">Typ i numer</span>
                <span className="lv-only-narrow">Typ</span>
            </Toggle>
            {colorsAvailable ? (
                <Toggle
                    pressed={showColors}
                    onPressedChange={onShowColorsChange}
                    title="Oryginalne kolory gry (wyłącza podświetlanie trafień w linii)"
                >
                    <span className="lv-hide-narrow">Kolory gry</span>
                    <span className="lv-only-narrow">Kolory</span>
                </Toggle>
            ) : null}
            <Toggle pressed={wrap} onPressedChange={onWrapChange} title="Zawijaj długie linie">
                <span className="lv-hide-narrow">Zawijanie</span>
                <span className="lv-only-narrow">Zawijaj</span>
            </Toggle>
            {live ? (
                <Toggle
                    pressed={follow}
                    onPressedChange={onFollowChange}
                    title="Przewijaj do nowych linii"
                >
                    <span className="lv-hide-narrow">
                        {follow ? "Śledzi na żywo" : "Śledź na żywo"}
                    </span>
                    <span className="lv-only-narrow">Na żywo</span>
                </Toggle>
            ) : null}
        </div>
    );
}
