import Client from "../Client";

export default function initOrderTimer(client: Client) {
    const tag = 'order-timer';
    const ORDER_TIME = 15; // seconds
    let timer: number | null = null;
    let end = 0;

    const orderPatterns = [
        /^Wydajesz rozkaz/,
        /^Glosno wypowiadasz rozkaz, chyba jednak nikt cie nie zrozumial/,
        /przekazuje ci prowadzenie druzyny\./
    ];

    function stopTimer() {
        if (timer != null) {
            clearInterval(timer);
            timer = null;
        }
        client.sendEvent('orderTimer', null);
    }

    function update() {
        const left = end - Date.now();
        if (left <= 0) {
            stopTimer();
        } else {
            client.sendEvent('orderTimer', left / 1000);
        }
    }

    function startTimer() {
        // Only start timer if character is team leader
        if (!client.TeamManager.isLeader()) {
            return;
        }

        end = client.now() + ORDER_TIME * 1000;
        if (timer != null) {
            clearInterval(timer);
        }
        update();
        timer = window.setInterval(update, 100);
    }

    orderPatterns.forEach(pattern => {
        client.Triggers.registerTrigger(pattern, (line) => {
            startTimer();
            return line;
        }, tag);
    });
}
