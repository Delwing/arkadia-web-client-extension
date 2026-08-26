import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

export default function initCarriage(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;

    const setCarriageMode = (enabled: boolean) => {
        client.carriageMode = enabled;
        if (client.moveModeButton) {
            client.moveModeButton.disabled = enabled;
        }
        client.sendEvent('carriageModeChanged', enabled);
    };
    const enable = (line: AnsiAwareBuffer) => {
        setCarriageMode(true);
        return line;
    };
    const disable = (line: AnsiAwareBuffer) => {
        setCarriageMode(false);
        return line;
    };
    client.Triggers.registerTrigger(/^Siadasz (?:w|na) (.*) (dylizansie|wozie|bryczce)\.$/, enable, "carriageMode");
    client.Triggers.registerTrigger(/^Zsiadasz z (.*) (dylizansu|wozu|bryczki)\.$/, disable, "carriageMode");
    client.Triggers.registerTrigger(/^Wstajesz i wysiadasz z (.*) (dylizansu|wozu|bryczki)\.$/, disable, "carriageMode");
    client.Triggers.registerTrigger(/^Zwracasz (.*) (dylizans|woz|bryczke)\b/, disable, "carriageMode");

    list.push({
        pattern: /^\/woz$/,
        callback: () => {
            setCarriageMode(!client.carriageMode);
            client.println(`Tryb wozu: ${client.carriageMode ? "wlaczony" : "wylaczony"}`);
        },
    });
}
