import Client from "../Client";
import {colorString, findClosestColor} from "../Colors";
import { formatLabel } from "./functionalBind";
import appEventBus from "../events/app-event-bus";

export default function initLeaderAttackWarning(client: Client) {
    const RED = findClosestColor("#ff0000");
    const PADDING = 4; // two spaces on each side
    const warningInternval = 5000;
    let interval: ReturnType<typeof setInterval> | undefined;
    let lastText: string | undefined;

    function print(text: string) {
        const width = text.length + PADDING;
        const line = "=".repeat(width);
        const message = colorString(`${line}\n  ${text}  \n${line}`, RED);
        client.println(message);
    }

    function startPrinting(targetId?: string) {
        const attackTargetId = client.TeamManager.getAttackTargetId?.();
        const avatarTargetId = client.TeamManager.getAvatarAttackTargetId?.();
        if (attackTargetId && avatarTargetId === attackTargetId) {
            stopPrinting();
            return;
        }
        const attackBind = formatLabel(client.attackBind);
        const supportBind = formatLabel(client.supportBind);
        const text = attackTargetId && targetId === attackTargetId ?
            `Zaatakuj cel ataku (${attackBind})` : `wesprzyj (${supportBind})`;
        if (interval && text === lastText) {
            return;
        }
        stopPrinting();
        lastText = text;
        print(text);
        interval = setInterval(() => print(text), warningInternval);
    }

    function stopPrinting() {
        if (interval) {
            clearInterval(interval);
            interval = undefined;
        }
    }

    appEventBus.on('teamLeaderTargetNoAvatar', (targetId) => startPrinting(targetId));
    appEventBus.on('teamLeaderTargetAvatar', stopPrinting);
}
