import Client from "../Client";
import {colorString, findClosestColor} from "../Colors";
import appEventBus from "../events/app-event-bus";

export default function initFullHpTimer(client: Client) {
    const FULL_HP = 6;
    const SPRING_GREEN = findClosestColor("#00ff7f");
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
            appEventBus.emit("notify", {text: plain })
            timer = null;
        }, 180000);
    }

    appEventBus.on("settings", (settings) => {
        enabled = !!settings.fullHpMessage;
        if (!enabled) {
            clearTimer();
        }
    });

    appEventBus.on("gmcp.char.state", event => {
        const hp = event?.hp;
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
    })


    appEventBus.on("gmcp.char.info", event => {
        const info = event;
        if (info && typeof info.object_num !== "undefined") {
            playerNum = String(info.object_num);
        }
    });

    appEventBus.on("gmcp.objects.data", event => {
        if (!playerNum) return;
        const obj = event[playerNum];
        if (!obj || obj.attack_num === undefined) return;
        if (obj.attack_num !== false) {
            clearTimer();
        }
    });

    appEventBus.on("client.disconnect", () => {
        playerNum = undefined;
        clearTimer();
        previousHp = null;
    });
}

