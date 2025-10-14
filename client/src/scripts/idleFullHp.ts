import Client from "../Client";
import createIdleTimer from "../utils/idleTimer";
import appEventBus from "../events/app-event-bus";

export default function initIdleFullHp(client: Client) {
    const FULL_HP = 6;
    let prevHp = -1;
    const idleTimer = createIdleTimer();

    appEventBus.on('gmcp.char.state', (event) => {
        const hp = event.hp;
        if (typeof hp !== 'number') return;
        if (hp === FULL_HP && prevHp < FULL_HP && idleTimer.isIdle()) {
            client.notify('Masz pelne zycie');
            appEventBus.emit('notify', { text: 'Masz pelne zycie' });
        }
        prevHp = hp;
    });
}
