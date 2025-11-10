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
 *
 * Setup:
 * 1. Update API_ENDPOINT with your actual server URL
 * 2. Uncomment the fetch() call in sendObservation()
 * 3. Server should accept POST requests with JSON payload:
 *    {
 *      type: "sunrise" | "sunset",
 *      domain: "Empire" | "Ishtar",
 *      dayOfYear: number,
 *      hour: number,
 *      minutes: number,
 *      timestamp: string (ISO 8601)
 *    }
 *
 * After collecting data for a full year, you can:
 * - Calculate accurate sunrise/sunset times for each day
 * - Update the MONTHS table in clock.ts with day-specific times
 * - Or create a new day-of-year lookup table
 */
export default function initSunCalendarLogger(_client: Client) {
    const API_ENDPOINT = "https://arkadia-calendar.delwing.workers.dev/events";

    eventBus.on("clock.sunrise", async (data) => {
        try {
            await sendObservation("sunrise", data);
        } catch (error) {
            console.error("Failed to log sunrise observation:", error);
        }
    });

    eventBus.on("clock.sunset", async (data) => {
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
        }
    ): Promise<void> {
        const payload = {
            type,
            domain: data.domain,
            dayOfYear: data.dayOfYear,
            hour: data.observedHour,
            minutes: Math.floor(data.observedMinutes),
            timestamp: new Date().toISOString()
        };

        console.log(`[Sun Calendar Logger] ${type} on ${data.domain} day ${data.dayOfYear}: ${data.observedHour}:${Math.floor(data.observedMinutes).toString().padStart(2, '0')}`);

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
