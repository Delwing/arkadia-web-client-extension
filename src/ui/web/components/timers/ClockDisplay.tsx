import { useState, useEffect, useCallback, useRef } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@modules/core/eventBus";

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

// Season colors matching seasonPrint.ts
const SEASON_COLORS = [
    "#00ff7f", // wiosna (spring)
    "#ffff00", // lato (summer)
    "#ff8c00", // jesien (autumn)
    "#00bfff"  // zima (winter)
];

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
        return <span style={{ color: "gray" }}>--- | --:--</span>;
    }

    const hours = clockData.hours.toString().padStart(2, "0");
    const minutes = Math.floor(clockData.minutes).toString().padStart(2, "0");
    const timeValue = `${hours}:${minutes}`;
    const precisionValue = clockData.precision > 0 ? `\u00b1${clockData.precision}` : "";

    const seasonIndex = typeof clockData.season === "number" && clockData.season >= 0 && clockData.season < SEASON_COLORS.length
        ? clockData.season : -1;
    const dayColor = seasonIndex >= 0 ? SEASON_COLORS[seasonIndex] : "lightgray";
    const timeColor = clockData.daylight === true ? "#fbbf24" : clockData.daylight === false ? "#60a5fa" : "white";

    return (
        <>
            <span style={{ color: dayColor }}>{clockData.dayLabel}</span>
            {" | "}
            <span style={{ color: timeColor }}>{timeValue}</span>
            {precisionValue && <> <span style={{ color: "gray" }}>{precisionValue}</span></>}
        </>
    );
};

export default ClockDisplay;
