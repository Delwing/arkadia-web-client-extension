import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

export default function initCarriage(client: Client) {
    const enable = (line: AnsiAwareBuffer) => {
        client.carriageMode = true;
        if (client.moveModeButton) {
            client.moveModeButton.disabled = true;
        }
        return line;
    };
    const disable = (line) => {
        client.carriageMode = false;
        if (client.moveModeButton) {
            client.moveModeButton.disabled = false;
        }
        return line;
    };
    client.Triggers.registerTrigger(/^Siadasz w (.*) (dylizansie|wozie|bryczce)\.$/, enable, "carriageMode");
    client.Triggers.registerTrigger(/^Zsiadasz z (.*) (dylizansu|wozu|bryczki)\.$/, disable, "carriageMode");
}
