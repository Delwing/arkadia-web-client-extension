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
    client.addEventListener('gmcp.char.state', (ev: CustomEvent) => {
        let hp = ev.detail?.hp;
        if (typeof hp !== 'number') return;
        hp++;
        if (hp < prev && hp < 3) {
            const plain = `Jestes ${CONDITIONS[hp] ?? ''}`;
            const msg = colorString(plain, ORANGE);
            client.playSound('beep');
            client.println(`\n\n${msg}\n\n`);
            client.notify(plain);
        }
        prev = hp;
    });
}
