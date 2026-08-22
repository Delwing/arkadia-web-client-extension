import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import { createBindMessage, formatLabel } from "../functionalBind";

export default function initHpAlert(client: Client) {
    const ORANGE = createColorFormat("#ffa500");
    const CONDITIONS_MALE = [
        '',
        'ledwo zywy',
        'ciezko ranny',
        'w zlej kondycji',
        'ranny',
        'lekko ranny',
        'w dobrym stanie',
        'w swietnej kondycji',
    ];
    const CONDITIONS_FEMALE = [
        '',
        'ledwo zywa',
        'ciezko ranna',
        'w zlej kondycji',
        'ranna',
        'lekko ranna',
        'w dobrym stanie',
        'w swietnej kondycji',
    ];
    let prev = Infinity;
    let alertLevel = 2;

    const getConditions = () =>
        characterStorage.get('gender') === 'female' ? CONDITIONS_FEMALE : CONDITIONS_MALE;

    const applySettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as { lowHpAlert?: unknown };
        if (typeof detail.lowHpAlert === 'boolean') {
            alertLevel = detail.lowHpAlert ? 2 : 0;
            return;
        }
        const value = Number(detail.lowHpAlert);
        if (Number.isFinite(value)) {
            const max = CONDITIONS_MALE.length - 1;
            alertLevel = Math.max(0, Math.min(max, Math.floor(value)));
        } else {
            alertLevel = 2;
        }
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', applySettings);

    client.on('gmcp.char.state', (state) => {
        let hp = state?.hp;
        if (typeof hp !== 'number') return;
        hp++;
        if (alertLevel <= 0) {
            prev = hp;
            return;
        }
        if (hp < prev && hp <= alertLevel) {
            const plain = `Jestes ${getConditions()[hp] ?? ''}`;
            const msg = colorString(plain, ORANGE).prepend("\n").append('\n');
            client.sendEvent("sound:category", "hp");
            client.println(msg);
            const doubleK = client.keyBindingManager.doubleKBind;
            const label = `${formatLabel(doubleK)} x2`;
            client.println(createBindMessage(label, '+k', () => client.sendCommand('+k')));
            client.notify(plain);
        }
        prev = hp;
    });
}
