import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

export default function initFullHpTimer(client: Client) {
    const FULL_HP = 6;
    const SPRING_GREEN = createColorFormat("#00ff7f");
    let timer: number | null = null;
    let enabled = false;
    let playerNum: number | undefined;
    let previousHp: number | null = null;

    function clearTimer() {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function startTimer() {
        if (!enabled || timer !== null) return;
        timer = window.setTimeout(() => {
            const plain = "Jestes w pelni zdrowia.";
            const msg = colorString(plain, SPRING_GREEN);
            client.println(msg);
            client.sendEvent("notify", { text: plain, system: true });
            timer = null;
        }, 180000);
    }

    const applySettings = (payload: any) => {
        const settings = (payload ?? defaultSettings) as { fullHpMessage?: boolean };
        enabled = !!settings.fullHpMessage;
        if (!enabled) {
            clearTimer();
        }
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', applySettings);

    client.on("gmcp.char.state", (state) => {
        const hp = state?.hp;
        if (typeof hp !== "number") {
            previousHp = null;
            return;
        }
        if (hp === FULL_HP) {
            if (previousHp !== null && previousHp > 0 && previousHp < FULL_HP) {
                startTimer();
            }
        } else {
            clearTimer();
        }
        previousHp = hp;
    });

    client.on("gmcp.char.info", (info) => {
        if (info && typeof info.object_num !== "undefined") {
            playerNum = info.object_num;
        }
    });

    client.on("gmcp.objects.data", (data) => {
        if (!playerNum) return;
        const obj = data[playerNum];
        if (!obj || obj.attack_num === undefined) return;
        if (obj.attack_num !== false) {
            clearTimer();
        }
    });

    client.on("client.disconnect", () => {
        playerNum = undefined;
        clearTimer();
        previousHp = null;
    });
}
