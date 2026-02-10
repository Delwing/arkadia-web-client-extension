import Client from "../Client";
import {colorStringInLine, createColorFormat} from "@modules/core/Colors";
import {IMPROVE_STATES} from "./improveCounter";

const SPRING_GREEN = createColorFormat("#00ff7f");
const DEEP_SKY_BLUE = createColorFormat("#00bfff");

const PROGRESS_DESC: Record<string, string> = {"zadnych": "[0/15]"};
IMPROVE_STATES.forEach((state, i) => {
    PROGRESS_DESC[state] = `[${i}/15]`;
});

export default function initAfterDeathProgress(client: Client) {
    const pattern = /^Twoje cechy sa oslabione po ostatniej smierci\. By je odbudowac potrzebujesz zdobyc jeszcze (.*) postepy\.$/;
    client.Triggers.registerTrigger(pattern, (line, matches) => {
        const progressText = matches[1];
        let buffer = line.color([0, line.length], SPRING_GREEN);
        buffer = colorStringInLine(buffer, progressText, DEEP_SKY_BLUE);
        const desc = PROGRESS_DESC[progressText];
        if (desc) {
            const idx = buffer.text.indexOf(progressText);
            if (idx !== -1) {
                const end = idx + progressText.length;
                buffer.insert(end, " " + desc, DEEP_SKY_BLUE);
            }
        }
        return buffer;
    }, "afterDeathProgress");
}
