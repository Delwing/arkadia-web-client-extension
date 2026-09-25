import type Client from "@client/Client";

const STATS_INTERVAL_MS = 5000;

/**
 * Proof-of-concept switch for the trigger literal prefilter (src/client/triggerPrefilter.ts).
 *
 * `?triggerPrefilter=1` turns it on, `?triggerPrefilter=0` keeps it off. Either value
 * also logs how long the trigger passes took every few seconds, so the two modes can be
 * compared tab against tab. Without the param nothing changes and nothing is measured.
 * `window.setTriggerPrefilter(true|false)` flips it at runtime for an A/B in one tab.
 */
export function installTriggerPrefilterFlag(client: Client): void {
    const param = new URLSearchParams(window.location.search).get("triggerPrefilter");
    if (param === null) return;

    const triggers = client.Triggers;
    triggers.literalPrefilter = param === "1" || param === "true" || param === "on";
    (window as any).setTriggerPrefilter = (enabled: boolean) => {
        triggers.literalPrefilter = !!enabled;
        console.info(`[triggers] literal prefilter ${enabled ? "ON" : "OFF"}`);
    };

    let lines = 0;
    let lineMs = 0;
    let frames = 0;
    let frameMs = 0;

    const parseLine = triggers.parseLine.bind(triggers);
    triggers.parseLine = (line, type) => {
        const start = performance.now();
        try {
            return parseLine(line, type);
        } finally {
            lineMs += performance.now() - start;
            lines++;
        }
    };
    const parseMultiline = triggers.parseMultiline.bind(triggers);
    triggers.parseMultiline = (line, type) => {
        const start = performance.now();
        try {
            return parseMultiline(line, type);
        } finally {
            frameMs += performance.now() - start;
            frames++;
        }
    };

    console.info(`[triggers] literal prefilter ${triggers.literalPrefilter ? "ON" : "OFF"} (?triggerPrefilter)`);
    setInterval(() => {
        if (lines === 0 && frames === 0) return;
        const perLine = lines > 0 ? (lineMs * 1000) / lines : 0;
        console.info(
            `[triggers] prefilter ${triggers.literalPrefilter ? "ON" : "OFF"}: ` +
            `${lines} lines in ${lineMs.toFixed(1)} ms (${perLine.toFixed(1)} µs/line), ` +
            `${frames} frames multiline ${frameMs.toFixed(1)} ms`,
        );
        lines = lineMs = frames = frameMs = 0;
    }, STATS_INTERVAL_MS);
}
