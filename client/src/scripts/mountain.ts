import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

export default function initMountain(client: Client) {
    let mountainMovingDir: "up" | "down" | undefined;
    const tag = "mountain";
    const YELLOW = findClosestColor("#ffff00");

    client.Triggers.registerTrigger(/Zaczynasz schodzic na dol\./, (_r, line) => {
        mountainMovingDir = "down";
        return colorString(line, YELLOW);
    }, tag);

    client.Triggers.registerTrigger(/Zaczynasz wspinac sie/, (_r, line) => {
        mountainMovingDir = "up";
        return colorString(line, YELLOW);
    }, tag);

    client.Triggers.registerTrigger(/Odpadasz od sciany i lecisz w dol/, (_r, line) => {
        if (mountainMovingDir === "up") {
            client.Map.moveBack();
        }
        return colorString(line, YELLOW);
    }, tag);
}

