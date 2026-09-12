import Client from "../Client";

/**
 * The cooldown is driven entirely by `maneuverAttempted`, which the upstream gag
 * scripts in `src/client/lua/` raise before they touch the line — so it fires
 * whether or not the player has the gag enabled. Keeping a second, hand-copied
 * set of patterns here only made them drift apart: the local copies missed the
 * `Na rozkaz`/`Zastawiasz sie`/`Sprytnie manewrujac` phrasings, and they started
 * the timer for a failed retreat behind *someone else*, which the lua correctly
 * ignores. Any new cover line should be taught to raise the event instead.
 */
export default function initCoverTimer(client: Client) {
    const COVER_TIME = 5; // seconds
    let timer: number | null = null;
    let end = 0;

    function stopTimer() {
        if (timer != null) {
            clearInterval(timer);
            timer = null;
        }
        client.sendEvent('coverTimer', null);
    }

    function update() {
        const left = end - Date.now();
        if (left <= 0) {
            stopTimer();
        } else {
            client.sendEvent('coverTimer', left / 1000);
        }
    }

    function startTimer() {
        end = client.now() + COVER_TIME * 1000;
        if (timer != null) {
            clearInterval(timer);
        }
        update();
        timer = window.setInterval(update, 100);
    }

    client.on('maneuverAttempted', () => {
        startTimer();
    });
}
