import Client from "../Client";

const DISPLAY_DURATION_MS = 30_000;
const INITIAL_SECONDS = Math.ceil(DISPLAY_DURATION_MS / 1000);

export default function initCombatTimer(client: Client) {
    let playerNum: string | undefined;
    let lastCombatState: boolean | null = null;
    let timer: number | null = null;
    let timerStart = 0;
    let lastEmitted: number | null = null;

    function emit(seconds: number | null) {
        client.sendEvent('combatTimer', seconds);
    }

    function stopTimer() {
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
        timerStart = 0;
        lastEmitted = null;
        emit(null);
    }

    function updateTimer() {
        if (timer === null) {
            return;
        }
        const elapsed = Date.now() - timerStart;
        const remaining = DISPLAY_DURATION_MS - elapsed;
        if (remaining <= 0) {
            stopTimer();
            return;
        }
        const seconds = Math.ceil(remaining / 1000);
        if (seconds !== lastEmitted) {
            lastEmitted = seconds;
            emit(seconds);
        }
    }

    function startTimer() {
        if (timer !== null) {
            clearInterval(timer);
        }
        timerStart = Date.now();
        lastEmitted = INITIAL_SECONDS;
        emit(INITIAL_SECONDS);
        timer = window.setInterval(updateTimer, 250);
    }

    function setCombatState(inCombat: boolean) {
        if (lastCombatState === null) {
            lastCombatState = inCombat;
            if (inCombat) {
                stopTimer();
            }
            return;
        }
        if (inCombat === lastCombatState) {
            return;
        }
        lastCombatState = inCombat;
        if (inCombat) {
            stopTimer();
        } else {
            startTimer();
        }
    }

    client.on('gmcp.char.info', info => {
        const detail = (info ?? {}) as { object_num?: unknown };
        const newPlayerNum = typeof detail.object_num !== 'undefined'
            ? String(detail.object_num)
            : undefined;
        if (newPlayerNum !== playerNum) {
            playerNum = newPlayerNum;
            lastCombatState = null;
            stopTimer();
        }
    });

    client.on('gmcp.objects.data', (detail) => {
        if (!playerNum) {
            return;
        }
        if (!detail || typeof detail !== 'object') {
            return;
        }
        const playerData = (detail as Record<string, any>)[playerNum];
        if (!playerData || typeof playerData !== 'object') {
            return;
        }
        if (!Object.prototype.hasOwnProperty.call(playerData, 'attack_num')) {
            return;
        }
        const attackNum = playerData.attack_num;
        const inCombat = attackNum !== false && typeof attackNum !== 'undefined';
        setCombatState(inCombat);
    });

    client.on('client.disconnect', () => {
        playerNum = undefined;
        lastCombatState = null;
        stopTimer();
    });

    emit(null);
}
