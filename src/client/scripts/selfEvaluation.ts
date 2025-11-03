import Client from "../Client";
import { SKIP_LINE } from "../ControlConstants";
import { colorString, findClosestColor } from "@modules/core/Colors";

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

    function startTimer() {
        if (timer) return;
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
            timer = undefined;
        }, 250);
    }

    function run() {
        summary = [];
        current = "";
        client.suppressItemEvaluation = true;

        const parent = client.Triggers.registerTrigger(
            /^Oceniasz [^,]+? ([^.]+)\.$/,
            (_r, _line, m) => {
                if (fallback) {
                    clearTimeout(fallback);
                    fallback = undefined;
                }
                current = m[1].trim();
                startTimer();
                return SKIP_LINE;
            },
            tag,
            { stayOpenLines: 50 }
        );

        parent.registerChild(
            /^Wyglada na to, ze .* \[(.+)]$/,
            (_r, _line, m) => {
                if (current) {
                    summary.push({ name: current, state: m[1] });
                    current = "";
                }
                startTimer();
                return SKIP_LINE;
            },
            tag
        );

        parent.registerChild(
            /^.*$/,
            () => {
                startTimer();
                return SKIP_LINE;
            },
            tag
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
        aliases.push({ pattern: /^\/sprzet$/, callback: run });
    }
}
