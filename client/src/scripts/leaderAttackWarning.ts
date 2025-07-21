import Client from "../Client";
import {colorString, findClosestColor} from "../Colors";

export default function initLeaderAttackWarning(client: Client) {
    const RED = findClosestColor("#ff0000");
    const PADDING = 4; // two spaces on each side

    const text = "Atakujesz inny cel";
    const width = text.length + PADDING;
    const line = "=".repeat(width);
    const message = colorString(`${line}\n  ${text}  \n${line}`, RED)
    const warningInternval = 5000;
    let interval: ReturnType<typeof setInterval> | undefined;

    function printWarning() {
        client.println(message);
    }

    function startPrinting() {
        if (!interval) {
            printWarning();
            interval = setInterval(printWarning, warningInternval);
        }
    }

    function stopPrinting() {
        if (interval) {
            clearInterval(interval);
            interval = undefined;
        }
    }

    client.addEventListener('teamLeaderTargetNoAvatar', startPrinting);
    client.addEventListener('teamLeaderTargetAvatar', stopPrinting);
}
