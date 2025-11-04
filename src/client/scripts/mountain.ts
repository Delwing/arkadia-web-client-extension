import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";

export default function initMountain(client: Client) {
    let mountainMovingDir: "up" | "down" | undefined;
    const tag = "mountain";
    const YELLOW = findClosestColor("#ffff00");

    client.Triggers.registerTrigger("Zaczynasz schodzic na dol.", (triggerLine) => {
        mountainMovingDir = "down";
        const line = triggerLine.text;
        const result = colorString(line, YELLOW);
        triggerLine.setOverrideAnsi(result);
        return triggerLine;
    }, tag);

    client.Triggers.registerTrigger(/Zaczynasz wspinac sie/, (triggerLine) => {
        mountainMovingDir = "up";
        const line = triggerLine.text;
        const result = colorString(line, YELLOW);
        triggerLine.setOverrideAnsi(result);
        return triggerLine;
    }, tag);

    client.Triggers.registerTrigger("Docierasz na gore.", (triggerLine) => {
        mountainMovingDir = undefined;
        const line = triggerLine.text;
        const result = colorString(line, YELLOW);
        triggerLine.setOverrideAnsi(result);
        return triggerLine;
    }, tag);

    client.Triggers.registerTrigger("Bezpiecznie schodzisz na dol.", (triggerLine) => {
        mountainMovingDir = undefined;
        const line = triggerLine.text;
        const result = colorString(line, YELLOW);
        triggerLine.setOverrideAnsi(result);
        return triggerLine;
    }, tag);

    client.Triggers.registerTrigger(/Odpadasz od sciany i lecisz w dol/, (triggerLine) => {
        if (mountainMovingDir === "up") {
            client.Map.moveBack();
        }
        const line = triggerLine.text;
        const result = colorString(line, YELLOW);
        triggerLine.setOverrideAnsi(result);
        return triggerLine;
    }, tag);
}

