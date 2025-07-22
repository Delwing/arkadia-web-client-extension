import Client from "../Client";
import { colorString, colorStringInLine, findClosestColor } from "../Colors";

export default function initMagikZnika(client: Client) {
    const COLOR = findClosestColor("#ff6347");
    const tag = "magik-znika";
    const prefix = "\n\t" + colorString("[  MAGIK ZNIKA   ] ", COLOR);

    const format = (line: string) => `${client.prefix(line, prefix)}\n`;

    client.Triggers.registerTrigger(
        /^Bialy, zimny plomien ogarnia (.*), w kilka chwil spopielajac .* calkowicie\.$/,
        (_raw, line, matches) => {
            const colored = colorStringInLine(line, matches[1], COLOR);
            return format(colored);
        },
        tag
    );
}
