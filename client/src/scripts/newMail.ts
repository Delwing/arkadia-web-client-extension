import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

export default function initNewMail(client: Client) {
    const COLOR = findClosestColor("tomato");
    const tag = "new-mail";
    const prefix = colorString("[ POCZTA ] ", COLOR);
    const pattern = /^Masz nowa poczte od (?'sender'[A-Za-z]+)\.$/;

    const format = (line: string) => `\n\n${client.prefix(colorString(line, COLOR), prefix)}\n\n`;

    client.Triggers.registerTrigger(pattern, (_raw, line) => format(line), tag);
}
