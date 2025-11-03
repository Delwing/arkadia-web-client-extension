import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";

export default function initNewMail(client: Client) {
    const TOMATO = findClosestColor("#ff6347");
    const tag = "new-mail";
    const prefix = colorString("[ POCZTA ] ", TOMATO);
    const pattern = /^Masz nowa poczte od (?<sender>[A-Za-z]+)\.$/;

    const format = (line: string) => `\n\n${client.prefix(colorString(line, TOMATO), prefix)}\n\n`;

    client.Triggers.registerTrigger(pattern, (_raw, line) => format(line), tag);
}
