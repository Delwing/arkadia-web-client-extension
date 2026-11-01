import Client from "../Client";
import createIdleTimer from "../utils/idleTimer";

export default function initIdleFullHp(client: Client) {
    const FULL_HP = 6;
    let prevHp = -1;
    const idleTimer = createIdleTimer(client);
    // Full hp regained mid-fight is not rest; only an out-of-combat recovery counts.
    let inCombat = false;

    client.on('combatState', (state) => {
        inCombat = state;
    });
    client.on('client.disconnect', () => {
        inCombat = false;
    });

    client.on('gmcp.char.state', (state) => {
        const hp = state?.hp;
        if (typeof hp !== 'number') return;
        if (hp === FULL_HP && prevHp < FULL_HP && !inCombat && idleTimer.isIdle()) {
            client.sendEvent('notify', { text: 'Masz pełne życie', level: 'success', source: 'client', key: 'hp.full', system: true });
            client.sendEvent('hp.idleFull', { text: 'Masz pełne życie' });
        }
        prevHp = hp;
    });
}
