import Client from "../Client";
import createIdleTimer from "../utils/idleTimer";

export default function initIdleFullHp(client: Client) {
    const FULL_HP = 6;
    let prevHp = -1;
    const idleTimer = createIdleTimer(client);

    client.on('gmcp.char.state', (state) => {
        const hp = state?.hp;
        if (typeof hp !== 'number') return;
        if (hp === FULL_HP && prevHp < FULL_HP && idleTimer.isIdle()) {
            client.sendEvent('notify', { text: 'Masz pelne zycie', system: true });
        }
        prevHp = hp;
    });
}
