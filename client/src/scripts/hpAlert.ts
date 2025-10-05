import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

export default function initHpAlert(client: Client) {
    const ORANGE = findClosestColor("#ffa500");
    const CONDITIONS = [
        '',
        'ledwo zywy',
        'ciezko ranny',
        'w zlej kondycji',
        'ranny',
        'lekko ranny',
        'w dobrym stanie',
        'w swietnej kondycji',
    ];
    let prev = Infinity;
    let alertLevel = 2;

    client.addEventListener('settings', (ev: CustomEvent) => {
        const settings = ev.detail || {};
        if (typeof settings.lowHpAlert === 'boolean') {
            alertLevel = settings.lowHpAlert ? 2 : 0;
            return;
        }
        const value = Number(settings.lowHpAlert);
        if (Number.isFinite(value)) {
            const max = CONDITIONS.length - 1;
            alertLevel = Math.max(0, Math.min(max, Math.floor(value)));
        } else {
            alertLevel = 2;
        }
    });

    client.addEventListener('gmcp.char.state', (ev: CustomEvent) => {
        let hp = ev.detail?.hp;
        if (typeof hp !== 'number') return;
        hp++;
        if (alertLevel <= 0) {
            prev = hp;
            return;
        }
        if (hp < prev && hp <= alertLevel) {
            const plain = `Jestes ${CONDITIONS[hp] ?? ''}`;
            const msg = colorString(plain, ORANGE);
            client.playSound('beep');
            client.println(`\n\n${msg}\n\n`);
            client.notify(plain);
        }
        prev = hp;
    });
}
