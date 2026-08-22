import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import { formatLabel } from "../functionalBind";

export default function initLeaderAttackWarning(client: Client) {
    const RED = createColorFormat("#ff0000");
    const PADDING = 4; // two spaces on each side
    const warningInterval = 5000;
    let lastText: string | undefined;
    let lastPrintedAt = 0;
    let activeTargetId: number | undefined;

    function resetReminder() {
        lastText = undefined;
        lastPrintedAt = 0;
    }

    function clearActiveTarget() {
        activeTargetId = undefined;
        resetReminder();
    }

    function print(text: string) {
        const width = text.length + PADDING;
        const line = "=".repeat(width);
        const message = colorString(`${line}\n  ${text}  \n${line}`, RED);
        client.println(message);
    }

    function printWarning(targetId?: number) {
        const attackTargetId = client.TeamManager.getAttackTargetId?.();
        const avatarTargetId = client.TeamManager.getAvatarAttackTargetId?.();
        if (!attackTargetId) {
            clearActiveTarget();
            return;
        }
        if (avatarTargetId === attackTargetId) {
            clearActiveTarget();
            return;
        }
        const attackBind = formatLabel(client.attackBind);
        const supportBind = formatLabel(client.supportBind);
        const text = attackTargetId && targetId === attackTargetId ?
            `Zaatakuj cel ataku (${attackBind})` : `wesprzyj (${supportBind})`;
        const now = Date.now();
        if (text === lastText && now - lastPrintedAt < warningInterval) {
            return;
        }
        lastText = text;
        lastPrintedAt = now;
        print(text);
    }

    client.on('teamLeaderTargetNoAvatar', (id) => {
        activeTargetId = id;
        printWarning(activeTargetId);
    });
    client.on('gmcp.objects.data', () => {
        if (!activeTargetId) {
            return;
        }

        printWarning(activeTargetId);
    });
    client.on('teamLeaderTargetAvatar', clearActiveTarget);
}
