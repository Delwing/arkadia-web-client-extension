import Client from "../Client";
import { SKIP_LINE } from "../ControlConstants";
import { colorString, findClosestColor } from "../Colors";

export default function initSelfEvaluation(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "self-evaluation";
    let current = "";
    let summary: { name: string; state: string }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;

    const GREEN = findClosestColor("#00ff00");
    const YELLOW = findClosestColor("#ffff00");
    const RED = findClosestColor("#ff0000");

    function colorState(state: string) {
        let color = RED;
        if (state === "max") {
            color = GREEN;
        } else {
            const m = state.match(/^(\d+)\/(\d+)$/);
            if (m) {
                const num = parseInt(m[1], 10);
                const den = parseInt(m[2], 10);
                if ((den === 7 && num >= 6) || (den === 5 && num === 5)) {
                    color = GREEN;
                } else if ((den === 7 && num === 5) || (den === 5 && num === 4)) {
                    color = YELLOW;
                }
            }
        }
        return colorString(`[${state}]`, color);
    }

    function resetTimer() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            client.Triggers.removeByTag(tag);
            if (summary.length > 0) {
                const max = Math.max(...summary.map(s => s.name.length));
                const lines = summary.map(({ name, state }) => {
                    const dots = ".".repeat(Math.max(1, max - name.length + 3));
                    return `${name} ${dots} ${colorState(state)}`;
                });
                client.println(lines.join("\n"));
            }
            summary = [];
            current = "";
            client.suppressItemEvaluation = false;
        }, 1000);
    }

    function run() {
        summary = [];
        current = "";
        client.suppressItemEvaluation = true;
        client.Triggers.registerTrigger(
            /^Oceniasz [^,]+? ([^.]+)\.$/,
            (_r, line, m) => {
                if (fallback) {
                    clearTimeout(fallback);
                    fallback = undefined;
                }
                if (m) {
                    current = m[1].trim();
                } else {
                    const cond = line.match(/^Wyglada na to, ze .* \[(.+)\]$/);
                    if (cond && current) {
                        summary.push({ name: current, state: cond[1] });
                        current = "";
                    }
                }
                resetTimer();
                return SKIP_LINE;
            },
            tag,
            { stayOpenLines: 50 }
        );

        client.sendCommand("ocen swoje bronie");
        client.sendCommand("ocen swoje zbroje");

        fallback = setTimeout(() => {
            client.Triggers.removeByTag(tag);
            client.suppressItemEvaluation = false;
            summary = [];
            current = "";
        }, 5000);
    }

    if (aliases) {
        aliases.push({ pattern: /^\/ocen$/, callback: run });
    }
}
