import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";

export default function initFullHpTimer(client: Client) {
    const FULL_HP = 6;
    const SPRING_GREEN = createColorFormat("#00ff7f");
    let timer: number | null = null;
    let enabled = false;
    let playerNum: string | undefined;
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
            client.println(`\n${msg}\n`);
            client.notify(plain);
            client.sendEvent("notify", { text: plain });
            timer = null;
        }, 180000);
    }

    client.on("settings", (payload) => {
        const settings = (payload ?? {}) as { fullHpMessage?: boolean };
        enabled = !!settings.fullHpMessage;
        if (!enabled) {
            clearTimer();
        }
    });

    client.on("gmcp.char.state", (state) => {
        const hp = (state as { hp?: number })?.hp;
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
        const detail = info as { object_num?: number };
        if (detail && typeof detail.object_num !== "undefined") {
            playerNum = String(detail.object_num);
        }
    });

    client.on("gmcp.objects.data", (data: Record<string, { attack_num?: boolean | number } | undefined>) => {
        if (!playerNum) return;
        const obj = data?.[playerNum];
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
