import { Segmented, Toggle } from "@design";
import { formatClock, pluralLines } from "../model/format";
import type { Density } from "../model/types";

export interface StatusBarProps {
    shownLines: number;
    totalLines: number;
    viewport: { from: number; to: number } | null;
    showTimestamps: boolean;
    onShowTimestampsChange: (value: boolean) => void;
    showColors: boolean;
    onShowColorsChange: (value: boolean) => void;
    /** Only offered when the session actually stores the game's colours. */
    colorsAvailable: boolean;
    wrap: boolean;
    onWrapChange: (value: boolean) => void;
    density: Density;
    onDensityChange: (value: Density) => void;
    live: boolean;
    follow: boolean;
    onFollowChange: (value: boolean) => void;
}

export function StatusBar({
    shownLines,
    totalLines,
    viewport,
    showTimestamps,
    onShowTimestampsChange,
    showColors,
    onShowColorsChange,
    colorsAvailable,
    wrap,
    onWrapChange,
    density,
    onDensityChange,
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
                <span className="lv-status__view">
                    W widoku {formatClock(viewport.from)} {"–"} {formatClock(viewport.to)}
                </span>
            ) : null}

            <div className="ark-spacer" />

            <Segmented
                value={density}
                onValueChange={onDensityChange}
                options={[
                    { value: "compact", label: "Gesto", title: "Wysokosc linii 21px" },
                    { value: "comfortable", label: "Luzno", title: "Wysokosc linii 26px" },
                ]}
            />
            <Toggle pressed={showTimestamps} onPressedChange={onShowTimestampsChange} title="Pokaz godziny">
                Godziny
            </Toggle>
            {colorsAvailable ? (
                <Toggle
                    pressed={showColors}
                    onPressedChange={onShowColorsChange}
                    title="Oryginalne kolory gry (wylacza podswietlanie trafien w linii)"
                >
                    Kolory gry
                </Toggle>
            ) : null}
            <Toggle pressed={wrap} onPressedChange={onWrapChange} title="Zawijaj dlugie linie">
                Zawijanie
            </Toggle>
            {live ? (
                <Toggle
                    pressed={follow}
                    onPressedChange={onFollowChange}
                    title="Przewijaj do nowych linii"
                >
                    {follow ? "Sledzi na zywo" : "Sledz na zywo"}
                </Toggle>
            ) : null}
        </div>
    );
}
