import Client from "../Client";

/**
 * Pipe-smoking indicator.
 *
 * Watches for the player lighting their pipe and for it burning out, and drives
 * the footer pipe icon (see src/web/pipeStatus.ts) via the `pipeLit` event.
 *
 * The pipe's description varies (e.g. "stara podniszczona fajka"), so the
 * patterns match the fixed phrasing around it and allow any lowercase
 * adjectives in between. More pipe-related behaviour will be added here later.
 */
export default function initPipe(client: Client) {
    const tag = "pipe";

    // "Zapalasz stara podniszczona fajke kilkakrotnie pykajac przy tym, aby podtrzymac zar."
    client.Triggers.registerTrigger(
        /^Zapalasz [a-z]+(?: [a-z]+)* fajke kilkakrotnie pykajac przy tym, aby podtrzymac zar\.$/,
        (line) => {
            client.sendEvent("pipeLit", true);
            return line;
        },
        tag,
    );

    // "Stara podniszczona fajka wypala sie i gasnie." (burns out on its own)
    client.Triggers.registerTrigger(
        /^[A-Z][a-z]+(?: [a-z]+)* fajka wypala sie i gasnie\.$/,
        (line) => {
            client.sendEvent("pipeLit", false);
            return line;
        },
        tag,
    );

    // "Gasisz stara podniszczona fajke." (you put it out)
    client.Triggers.registerTrigger(
        /^Gasisz [a-z]+(?: [a-z]+)* fajke\.$/,
        (line) => {
            client.sendEvent("pipeLit", false);
            return line;
        },
        tag,
    );
}
