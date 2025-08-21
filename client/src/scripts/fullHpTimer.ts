import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

export default function initFullHpTimer(client: Client) {
    const FULL_HP = 6;
    const SPRING_GREEN = findClosestColor("#00ff7f");
    let timer: number | null = null;
    let enabled = false;
    let playerNum: string | undefined;

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
            client.println(`\n\n${msg}\n\n`);
            client.notify(plain);
            client.sendEvent("notify", { text: plain });
            timer = null;
        }, 180000);
    }

    client.addEventListener("settings", (ev: CustomEvent) => {
        const settings = ev.detail || {};
        enabled = !!settings.fullHpMessage;
        if (!enabled) {
            clearTimer();
        }
    });

    client.addEventListener("gmcp.char.state", (ev: CustomEvent) => {
        const hp = ev.detail?.hp;
        if (typeof hp !== "number") return;
        if (hp === FULL_HP) {
            startTimer();
        } else {
            clearTimer();
        }
    });

    client.addEventListener("gmcp.char.info", (ev: CustomEvent) => {
        const info = ev.detail || {};
        if (info && typeof info.object_num !== "undefined") {
            playerNum = String(info.object_num);
        }
    });

    client.addEventListener("gmcp.objects.data", (ev: CustomEvent) => {
        if (!playerNum) return;
        const obj = ev.detail?.[playerNum];
        if (!obj || obj.attack_num === undefined) return;
        if (obj.attack_num !== false) {
            clearTimer();
        }
    });

    client.addEventListener("client.disconnect", () => {
        playerNum = undefined;
        clearTimer();
    });
}

