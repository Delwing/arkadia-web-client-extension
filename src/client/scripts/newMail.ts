import Client from "../Client";
import {findClosestColor} from "@modules/core/Colors";

export default function initNewMail(client: Client) {
    const TOMATO = findClosestColor("#ff6347");
    const tag = "new-mail";
    const pattern = /^Masz nowa poczte od (?<sender>[A-Za-z]+)\.$/;

    client.Triggers.registerTrigger(pattern, (line) => {
        return line.prefix("\n\n [ POCZTA ] ", TOMATO).suffix("\n\n");
    }, tag);
}
