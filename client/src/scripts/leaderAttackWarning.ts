import Client from "../Client";
import {colorString, findClosestColor} from "../Colors";
import { formatLabel } from "./functionalBind";

export default function initLeaderAttackWarning(client: Client) {
    const RED = findClosestColor("#ff0000");
    const PADDING = 4; // two spaces on each side
    const warningInterval = 5000;
    let lastText: string | undefined;
    let lastPrintedAt = 0;
    let activeTargetId: string | undefined;
    let dropRequestedAt: number | undefined;

    function print(text: string) {
        const width = text.length + PADDING;
        const line = "=".repeat(width);
        const message = colorString(`${line}\n  ${text}  \n${line}`, RED);
        client.println(message);
    }

    function stopPrinting() {
        lastText = undefined;
        lastPrintedAt = 0;
        activeTargetId = undefined;
        dropRequestedAt = undefined;
    }

    function shouldDrop(detail: Record<string, any> | undefined | null) {
        if (!detail || typeof detail !== "object") {
            return false;
        }
        return Object.values(detail).some(value =>
            value && typeof value === "object" && value.drop_leader_attack_warning === true
        );
    }

    function printWarning(targetId?: string, force = false) {
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
        const now = Date.now();
        if (!force && text === lastText && now - lastPrintedAt < warningInterval) {
            return;
        }
        lastText = text;
        lastPrintedAt = now;
        print(text);
    }

    client.addEventListener('teamLeaderTargetNoAvatar', (e: CustomEvent) => {
        activeTargetId = e.detail;
        dropRequestedAt = undefined;
        printWarning(activeTargetId, true);
    });
    client.addEventListener('gmcp.objects.data', (e: CustomEvent<Record<string, any>>) => {
        if (!activeTargetId) {
            return;
        }
        if (dropRequestedAt !== undefined) {
            if (Date.now() - dropRequestedAt >= warningInterval) {
                stopPrinting();
            }
            return;
        }
        if (shouldDrop(e.detail)) {
            dropRequestedAt = Date.now();
            return;
        }
        printWarning(activeTargetId);
    });
    client.addEventListener('teamLeaderTargetAvatar', stopPrinting);
}
