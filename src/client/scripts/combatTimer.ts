import Client from "../Client";

const DISPLAY_DURATION_MS = 32_000;
const INITIAL_SECONDS = Math.ceil(DISPLAY_DURATION_MS / 1000);

export default function initCombatTimer(client: Client) {
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
        timer = client.scope.interval(updateTimer, 250);
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
            // Even if the combat state hasn't changed, ensure timer is in correct state
            if (inCombat && timer !== null) {
                stopTimer();
            }
            return;
        }
        lastCombatState = inCombat;
        if (inCombat) {
            stopTimer();
        } else {
            startTimer();
        }
    }

    // Listen to centralized combat state event
    client.on('combatState', (inCombat) => {
        setCombatState(inCombat);
    });

    client.on('client.disconnect', () => {
        lastCombatState = null;
        stopTimer();
    });

    emit(null);
}
