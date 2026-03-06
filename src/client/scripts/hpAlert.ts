import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

export default function initHpAlert(client: Client) {
    const ORANGE = createColorFormat("#ffa500");
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

    const applySettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as { lowHpAlert?: unknown };
        if (typeof detail.lowHpAlert === 'boolean') {
            alertLevel = detail.lowHpAlert ? 2 : 0;
            return;
        }
        const value = Number(detail.lowHpAlert);
        if (Number.isFinite(value)) {
            const max = CONDITIONS.length - 1;
            alertLevel = Math.max(0, Math.min(max, Math.floor(value)));
        } else {
            alertLevel = 2;
        }
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', applySettings);

    client.on('gmcp.char.state', (state) => {
        const detail = state as { hp?: number };
        let hp = detail?.hp;
        if (typeof hp !== 'number') return;
        hp++;
        if (alertLevel <= 0) {
            prev = hp;
            return;
        }
        if (hp < prev && hp <= alertLevel) {
            const plain = `Jestes ${CONDITIONS[hp] ?? ''}`;
            const msg = colorString(plain, ORANGE).prepend("\n").append('\n');
            client.sendEvent("sound:play", { key: "beep" });
            client.println(msg);
            client.notify(plain);
        }
        prev = hp;
    });
}
