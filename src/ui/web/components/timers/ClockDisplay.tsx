import { useState, useEffect, useCallback, useRef } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@modules/core/eventBus";
import { MOON_COLOR, SEASON_COLORS, SUN_COLOR } from "@web/popups/worldPalette.ts";

type ClockData = {
    domain: "Empire" | "Ishtar";
    hours: number;
    minutes: number;
    precision: number;
    sunrise: number | string | "?";
    sunset: number | string | "?";
    dayLabel: string;
    dayOfMonth: number;
    dayOfYear: number;
    daylight?: boolean;
    season?: number;
};

// The season table, the sun and the moon come from @web/popups/worldPalette.ts
// -- the same source the Zegar / Kalendarz / Czas / Slonce popups read. This
// chip used to carry a fourth copy of the four season hues, spelled as raw hex,
// so the footer and the popups disagreed about what Wiosna looks like.

/**
 * ClockDisplay component - displays current time and precision
 */
export const ClockDisplay: React.FC = () => {
    const [clockData, setClockData] = useState<ClockData | null>(null);

    // Use ref to avoid closure issues in event handlers
    const activeDomainRef = useRef<"Empire" | "Ishtar" | null>(null);

    // Listen for active domain changes
    useClientEvent<{ domain: "Empire" | "Ishtar" }>("clock.domain.active", (data) => {
        const prev = activeDomainRef.current;
        activeDomainRef.current = data.domain;
        // Clear clock data when switching between domains to avoid stale display
        if (prev && prev !== data.domain) {
            setClockData(null);
        }
    });

    // Listen for clock updates from all domains
    useClientEvent<ClockData>("clock.update", (data) => {
        const currentActiveDomain = activeDomainRef.current;
        if (currentActiveDomain && data.domain === currentActiveDomain) {
            setClockData(data);
        }
    });

    const handleClick = useCallback(() => {
        eventBus.emit("clock.popup.open", { domain: clockData?.domain ?? activeDomainRef.current ?? undefined });
    }, [clockData]);

    // Manage container attributes that React cannot control (cursor, title, onclick)
    useEffect(() => {
        const container = document.getElementById("clock-display");
        if (!container) return;
        container.style.display = "block";
        container.style.cursor = "pointer";
        container.title = "Kliknij aby otworzyc szczegoly zegara";
        container.onclick = handleClick;
    }, [handleClick]);

    if (!clockData) {
        return <span style={{ color: "var(--ark-text-tertiary)" }}>--- | --:--</span>;
    }

    const hours = clockData.hours.toString().padStart(2, "0");
    const minutes = Math.floor(clockData.minutes).toString().padStart(2, "0");
    const timeValue = `${hours}:${minutes}`;
    const precisionValue = clockData.precision > 0 ? `\u00b1${clockData.precision}` : "";

    const seasonIndex = typeof clockData.season === "number" && clockData.season >= 0 && clockData.season < SEASON_COLORS.length
        ? clockData.season : -1;
    const dayColor = seasonIndex >= 0 ? SEASON_COLORS[seasonIndex] : "var(--ark-text-secondary)";
    // Daylight vs night is the sun/moon axis the palette already names, so the
    // chip and the sun popups now agree. The unknown case used to be a hard
    // named colour at the bright end of the scale, which on parchment and
    // silver put near-invisible text on a light footer.
    const timeColor = clockData.daylight === true
        ? SUN_COLOR
        : clockData.daylight === false ? MOON_COLOR : "var(--ark-text)";

    return (
        <>
            <span style={{ color: dayColor }}>{clockData.dayLabel}</span>
            {" | "}
            <span style={{ color: timeColor }}>{timeValue}</span>
            {precisionValue && <> <span style={{ color: "var(--ark-text-tertiary)" }}>{precisionValue}</span></>}
        </>
    );
};

export default ClockDisplay;
