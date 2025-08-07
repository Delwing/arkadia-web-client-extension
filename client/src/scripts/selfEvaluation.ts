import Client from "../Client";
import { SKIP_LINE } from "../ControlConstants";

export default function initSelfEvaluation(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "self-evaluation";
    let current = "";
    let summary: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    function resetTimer() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            client.Triggers.removeByTag(tag);
            if (summary.length > 0) {
                client.println(summary.join("\n"));
            }
            summary = [];
            current = "";
        }, 1000);
    }

    function run() {
        summary = [];
        current = "";
        client.Triggers.registerTrigger(/^Oceniasz [^,]+? ([^.]+)\.$/, (_r, _l, m) => {
            current = m[1].trim();
            resetTimer();
            return SKIP_LINE;
        }, tag);

        client.Triggers.registerTrigger(/^Wyglada na to, ze .* \[(.+)\]$/, (_r, _l, m) => {
            if (current) {
                summary.push(`${current} [${m[1]}]`);
            }
            current = "";
            resetTimer();
            return SKIP_LINE;
        }, tag);

        client.Triggers.registerTrigger(/^Oceniasz, ze .*$/, () => {
            resetTimer();
            return SKIP_LINE;
        }, tag);

        client.Triggers.registerTrigger(/^.*$/, () => {
            resetTimer();
            return SKIP_LINE;
        }, tag);

        client.sendCommand("ocen swoje bronie");
        client.sendCommand("ocen swoje zbroje");
        resetTimer();
    }

    if (aliases) {
        aliases.push({ pattern: /^\/ocen$/, callback: run });
    }
}
