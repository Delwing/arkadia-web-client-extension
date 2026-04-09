import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";

const YELLOW = createColorFormat("#ffff00");
const RED = createColorFormat("#ff0000");

export default function initWarningTriggers(client: Client) {
    const tag = "warningTriggers";

    // Gubisz gdzies za soba - yellow with ==> prefix, new lines before and after
    client.Triggers.registerTrigger(/^Gubisz gdzies za soba .*/, (line) => {
        const result = new AnsiAwareBuffer();
        result.append("\n");
        result.append("==> ", YELLOW);
        result.appendBuffer(line.color([0, line.length], YELLOW));
        result.append("\n\n");
        return result;
    }, tag);

    // Kompas breaking - red warning with beep and [SPRZET] prefix
    client.Triggers.registerTrigger(/^Widzisz jak .* kompasu peka, a cale urzadzenie po prostu rozpada ci sie w rekach\.$/, (line) => {
        client.sendEvent("sound:category", "gear");
        const result = new AnsiAwareBuffer();
        result.append("[ SPRZET ] ", RED);
        result.appendBuffer(line.color([0, line.length], RED));
        return result;
    }, tag);
}
