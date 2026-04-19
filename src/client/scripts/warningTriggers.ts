import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";

const RED = createColorFormat("#ff0000");

export default function initWarningTriggers(client: Client) {
    const tag = "warningTriggers";

    client.Triggers.registerTrigger(/^Widzisz jak .* kompasu peka, a cale urzadzenie po prostu rozpada ci sie w rekach\.$/, (line) => {
        client.sendEvent("sound:category", "gear");
        const result = new AnsiAwareBuffer();
        result.append("[ SPRZET ] ", RED);
        result.appendBuffer(line.color([0, line.length], RED));
        return result;
    }, tag);
}
