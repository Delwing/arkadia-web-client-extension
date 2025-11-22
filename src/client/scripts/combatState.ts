import Client from "../Client";

/**
 * Centralized combat state detection.
 * Monitors GMCP objects.data and emits combatState events when the player's
 * combat status changes.
 */
export default function initCombatState(client: Client) {
    let playerNum: number | undefined;

    client.on('gmcp.char.info', info => {
        const detail = (info ?? {}) as { object_num?: number };
        const newPlayerNum = typeof detail.object_num !== 'undefined'
            ? detail.object_num
            : undefined;
        if (newPlayerNum !== playerNum) {
            playerNum = newPlayerNum;
        }
    });

    client.on('gmcp.objects.data', (detail) => {
        if (!playerNum) {
            return;
        }
        const playerData = detail[playerNum];
        if (!playerData) {
            return;
        }
        const attackNum = playerData.attack_num;
        // Only emit combat state when attack_num is defined (not undefined)
        // This is the canonical combat detection logic used by both timer and title
        if (typeof attackNum === 'undefined') {
            return;
        }
        const inCombat = attackNum !== false;
        client.sendEvent('combatState', inCombat);
    });

    client.on('client.disconnect', () => {
        playerNum = undefined;
    });
}
