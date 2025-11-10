import { useState, useEffect, useRef } from "react";
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
    const [activeDomain, setActiveDomain] = useState<"Empire" | "Ishtar" | null>(null);
    const [showClock, setShowClock] = useState(true);

    // Use ref to avoid closure issues in event handlers
    const activeDomainRef = useRef<"Empire" | "Ishtar" | null>(null);

    // Listen for UI settings changes
    useClientEvent<{ showClockDisplay?: boolean }>("uiSettings", (data) => {
        if (typeof data.showClockDisplay === "boolean") {
            setShowClock(data.showClockDisplay);
        }
    });

    // Listen for active domain changes
    useClientEvent<{ domain: "Empire" | "Ishtar" }>("clock.domain.active", (data) => {
        activeDomainRef.current = data.domain;
        setActiveDomain(data.domain);
    });

    // Listen for clock updates from all domains
    useClientEvent<ClockData>("clock.update", (data) => {
        const currentActiveDomain = activeDomainRef.current;
        // Only update footer display if this is the active domain
        // (activeDomain is set by clock.domain.active event when time is checked)
        if (currentActiveDomain && data.domain === currentActiveDomain) {
            setClockData(data);
        }
    });

    // When active domain changes, clear the display briefly
    useEffect(() => {
        if (!activeDomain) {
            setClockData(null);
            return;
        }

        // Clear current data to show placeholder briefly if switching domains
        // The clock emits updates every 500ms, so we'll get fresh data soon
        setClockData(null);
    }, [activeDomain]);

    const handleClick = () => {
        if (clockData) {
            eventBus.emit("clock.popup.open", { domain: clockData.domain });
        }
    };

    // Update the container's display and content
    useEffect(() => {
        const container = document.getElementById("clock-display");
        if (!container) return;

        // If clock display is disabled in settings, hide completely
        if (!showClock) {
            container.style.display = "none";
            container.innerHTML = "";
            container.style.cursor = "default";
            container.onclick = null;
            return;
        }

        // If no clock data yet, show placeholder
        if (!clockData) {
            container.style.display = "block";
            container.style.cursor = "pointer";
            container.title = "Kliknij aby otworzyc szczegoly zegara";
            container.innerHTML = `<span style="color: gray;">--- | --:--</span>`;
            container.onclick = handleClick;
            return;
        }

        // Format time as HH:MM
        const hours = clockData.hours.toString().padStart(2, "0");
        const minutes = Math.floor(clockData.minutes).toString().padStart(2, "0");
        const timeValue = `${hours}:${minutes}`;

        // Format precision as ±M
        const precisionValue = clockData.precision > 0 ? `±${clockData.precision}` : "";

        // Determine day/month color based on season
        const seasonIndex = typeof clockData.season === "number" && clockData.season >= 0 && clockData.season < SEASON_COLORS.length
            ? clockData.season
            : -1;
        const dayColor = seasonIndex >= 0 ? SEASON_COLORS[seasonIndex] : "lightgray";

        // Determine time color based on day/night
        const timeColor = clockData.daylight === true ? "#fbbf24" : clockData.daylight === false ? "#60a5fa" : "white";

        // Display day/month | time precision
        container.style.display = "block";
        container.style.cursor = "pointer";
        container.title = "Kliknij aby otworzyc szczegoly zegara";
        container.innerHTML = `<span style="color: ${dayColor};">${clockData.dayLabel}</span> | <span style="color: ${timeColor};">${timeValue}</span>${precisionValue ? ` <span style="color: gray;">${precisionValue}</span>` : ""}`;
        container.onclick = handleClick;
    }, [clockData, handleClick, showClock]);

    return null;
};

export default ClockDisplay;
