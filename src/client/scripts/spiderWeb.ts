import Client from "../Client";

/**
 * Spider Web Module
 * Handles spider web trap detection and binds the blocked direction for retry.
 */
export default function initSpiderWeb(client: Client) {
    client.Triggers.registerTrigger(
        /^Probujesz sie ruszyc na (.+?), jednak pajecze sieci, w ktore sie w miedzyczasie zaplatal.s, uniemozliwiaja ci to\.$/,
        (line, matches) => {
            const direction = matches[1];
            client.FunctionalBind.set(direction, undefined, true);
            return line;
        },
        "spider-web",
    );
}
