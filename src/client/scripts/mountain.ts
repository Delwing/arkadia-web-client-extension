import Client from "../Client";
import {findClosestColor} from "@modules/core/Colors";

export default function initMountain(client: Client) {
    let mountainMovingDir: "up" | "down" | undefined;
    const tag = "mountain";
    const YELLOW = findClosestColor("#ffff00");

    client.Triggers.registerTrigger("Zaczynasz schodzic na dol.", (line) => {
        mountainMovingDir = "down";
        return line.color([0, line.length], YELLOW);
    }, tag);

    client.Triggers.registerTrigger(/Zaczynasz wspinac sie/, (line) => {
        mountainMovingDir = "up";
        return line.color([0, line.length], YELLOW);
    }, tag);

    client.Triggers.registerTrigger("Docierasz na gore.", (line) => {
        mountainMovingDir = undefined;
        return line.color([0, line.length], YELLOW);
    }, tag);

    client.Triggers.registerTrigger("Bezpiecznie schodzisz na dol.", (line) => {
        mountainMovingDir = undefined;
        return line.color([0, line.length], YELLOW);
    }, tag);

    client.Triggers.registerTrigger(/Odpadasz od sciany i lecisz w dol/, (line) => {
        if (mountainMovingDir === "up") {
            client.Map.moveBack();
        }
        return line.color([0, line.length], YELLOW);
    }, tag);
}

