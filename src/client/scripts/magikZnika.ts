import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";

export default function initMagikZnika(client: Client) {
    const COLOR = findClosestColor("#ff6347");
    const tag = "magik-znika";
    const prefix = "\n\t" + colorString("[  MAGIK ZNIKA   ]", COLOR);

    const format = (line: string) => `${prefix} ${colorString(line, COLOR)}\n`;

    client.Triggers.registerTrigger(
        /^Bialy, zimny plomien ogarnia (.*), w kilka chwil spopielajac .* calkowicie\.$/,
        (triggerLine) => {
            const formatted = format(triggerLine.text);
            triggerLine.setOverrideAnsi(formatted);
            return triggerLine;
        },
        tag
    );
}
