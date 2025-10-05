import Client from "../Client";

const PROMPT_PATTERN = /Wpisz ~\?, zeby uzyskac pomoc, lub \*\*, by zakonczyc edycje\./;
const TRIGGER_TAG = "letter-composer";

interface LetterSubmitPayload {
    to: string;
    cc: string;
    subject: string;
    content: string;
}

function justifyLine(line: string) {
    return line
        .replace(/\s+/g, " ")
        .trim();
}

export default function initLetter(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    if (aliases) {
        aliases.push({
            pattern: /^\/list$/,
            callback: () => {
                client.sendEvent("letterComposer", { open: true });
            }
        });
    }

    client.addEventListener("letterComposer.submit", (event: CustomEvent<LetterSubmitPayload>) => {
        const { to, cc, subject, content } = event.detail;
        const recipient = to.trim();
        const carbonCopy = cc.trim();
        const subjectLine = subject.trim();
        const lines = content
            .split(/\r?\n/)
            .map(line => justifyLine(line))
            .filter((line, index, arr) => {
                if (line.length > 0) {
                    return true;
                }
                // Preserve intentional blank lines between non-empty content
                const prev = index > 0 ? arr[index - 1] : "";
                const next = index < arr.length - 1 ? arr[index + 1] : "";
                return prev.length > 0 && next.length > 0;
            });

        client.Triggers.removeByTag(TRIGGER_TAG);
        client.Triggers.registerOneTimeTrigger(
            PROMPT_PATTERN,
            () => {
                lines.forEach(line => {
                    if (line.length > 0) {
                        client.sendCommand(line);
                    }
                });
                client.sendCommand("**");
                return undefined;
            },
            TRIGGER_TAG
        );

        client.sendCommand("napisz list");
        client.sendCommand(recipient);
        client.sendCommand(subjectLine);
        client.sendCommand(carbonCopy);
    });
}
