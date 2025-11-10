import eventBus from "@modules/core/eventBus";
import type Client from "../Client";

/**
 * Sun Calendar Logger
 *
 * Logs all sunrise and sunset observations to build an accurate calendar
 * of sun times for each day of the year (Empire: 400 days, Ishtar: 360 days).
 *
 * How it works:
 * - Listens to "clock.sunrise" and "clock.sunset" events
 * - Sends HTTP POST requests with observed time data
 * - Logs console messages for debugging
 * - State machine: only logs after at least one successful time check
 *
 * States:
 * - "waiting": Initial state, waiting for first time check
 * - "active": At least one time check done, logging enabled
 *
 * State transitions:
 * - "waiting" -> "active": When clock.update event fires (time check)
 * - "active" -> "waiting": When reset event fires
 *
 * Setup:
 * 1. Update API_ENDPOINT with your actual server URL
 * 2. Uncomment the fetch() call in sendObservation()
 * 3. Server should accept POST requests with JSON payload:
 *    {
 *      type: "sunrise" | "sunset",
 *      domain: "Empire" | "Ishtar",
 *      dayOfYear: number,
 *      hour: number,               // Corrected hour (what clock is set to)
 *      minutes: number,            // Always 0 after correction
 *      indicatedHour: string,      // Raw observed hour before correction (e.g., "4:59")
 *      locationId: number | null,  // Current location/room ID
 *      timestamp: string (ISO 8601)
 *    }
 *
 * After collecting data for a full year, you can:
 * - Calculate accurate sunrise/sunset times for each day
 * - Update the MONTHS table in clock.ts with day-specific times
 * - Or create a new day-of-year lookup table
 */
export default function initSunCalendarLogger(client: Client) {
    const API_ENDPOINT = "https://arkadia-calendar.delwing.workers.dev/events";

    // State machine: only log after at least one time check
    const state: { empire: "waiting" | "active"; ishtar: "waiting" | "active" } = {
        empire: "waiting",
        ishtar: "waiting"
    };

    // Listen for clock updates (time checks) to enable logging
    eventBus.on("clock.update", (data) => {
        if (data.domain === "Empire") {
            state.empire = "active";
        } else if (data.domain === "Ishtar") {
            state.ishtar = "active";
        }
    });

    // Listen for reset events to disable logging
    eventBus.on("reset", () => {
        state.empire = "waiting";
        state.ishtar = "waiting";
    });

    eventBus.on("clock.sunrise", async (data) => {
        // Only log if we've had at least one time check for this domain
        const domainState = data.domain === "Empire" ? state.empire : state.ishtar;
        if (domainState !== "active") {
            return;
        }

        try {
            await sendObservation("sunrise", data);
        } catch (error) {
            console.error("Failed to log sunrise observation:", error);
        }
    });

    eventBus.on("clock.sunset", async (data) => {
        // Only log if we've had at least one time check for this domain
        const domainState = data.domain === "Empire" ? state.empire : state.ishtar;
        if (domainState !== "active") {
            return;
        }

        try {
            await sendObservation("sunset", data);
        } catch (error) {
            console.error("Failed to log sunset observation:", error);
        }
    });

    async function sendObservation(
        type: "sunrise" | "sunset",
        data: {
            domain: "Empire" | "Ishtar";
            dayOfYear: number;
            observedHour: number;
            observedMinutes: number;
            indicatedHour?: string;
        }
    ): Promise<void> {
        const payload = {
            type,
            domain: data.domain,
            dayOfYear: data.dayOfYear,
            hour: data.observedHour,
            minutes: Math.floor(data.observedMinutes),
            indicatedHour: data.indicatedHour,
            locationId: client.Map.currentRoom.id,
            timestamp: new Date().toISOString()
        };

        console.log(`[Sun Calendar Logger] ${type} on ${data.domain} day ${data.dayOfYear}: ${data.observedHour}:${Math.floor(data.observedMinutes).toString().padStart(2, '0')}${data.indicatedHour ? ` (indicated: ${data.indicatedHour})` : ''}`);

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            console.log(`[Sun Calendar Logger] Successfully sent ${type} observation for ${data.domain} day ${data.dayOfYear}`);
        } catch (error) {
            console.error(`[Sun Calendar Logger] Failed to send ${type} observation:`, error);
            // Don't throw - we want to continue even if the API is down
        }
    }
}
