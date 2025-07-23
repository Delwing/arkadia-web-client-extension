import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";
import { stripAnsiCodes } from "../Triggers";

export default function initMagikZnika(client: Client) {
    const COLOR = findClosestColor("#ff6347");
    const tag = "magik-znika";
    const prefix = "\n\t" + colorString("[  MAGIK ZNIKA   ]", COLOR);

    const format = (line: string) => `${prefix}\n${colorString(line, COLOR)}\n`;

    client.Triggers.registerTrigger(
        /^Bialy, zimny plomien ogarnia (.*), w kilka chwil spopielajac .* calkowicie\.$/,
        (raw) => {
            const line = stripAnsiCodes(raw).replace(/\s$/g, "");
            return format(line);
        },
        tag
    );
}
