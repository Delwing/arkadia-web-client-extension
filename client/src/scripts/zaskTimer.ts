import Client from "../Client";
import appEventBus from "../events/app-event-bus";

const SAFE_THRESHOLD_SECONDS = 30;

interface ZaskTimerPayload {
    seconds: number;
    ok: boolean;
}

export default function initZaskTimer(client: Client) {
    let timer: number | null = null;
    let start = 0;
    let active = false;

    function clearTimer() {
        if (timer != null) {
            clearInterval(timer);
            timer = null;
        }
    }

    function emit(payload: ZaskTimerPayload | null) {
        appEventBus.emit('zaskTimer', payload);
    }

    function stopTimer() {
        clearTimer();
        if (active) {
            active = false;
            emit(null);
        }
    }

    function updateTimer() {
        if (!active) return;
        const seconds = Math.floor((Date.now() - start) / 1000);
        if (seconds >= SAFE_THRESHOLD_SECONDS) {
            clearTimer();
            emit({ seconds, ok: true });
        } else {
            emit({ seconds, ok: false });
        }
    }

    function startTimer() {
        start = Date.now();
        active = true;
        clearTimer();
        updateTimer();
        timer = window.setInterval(updateTimer, 1000);
    }

    appEventBus.on('gmcp.room.info', () => {
        if (client.moveMode > 0) {
            startTimer();
        } else {
            stopTimer();
        }
    });

    appEventBus.on('moveModeChanged', (mode) => {
        if (mode === 0) {
            stopTimer();
        }
    });

    emit(null);
}
