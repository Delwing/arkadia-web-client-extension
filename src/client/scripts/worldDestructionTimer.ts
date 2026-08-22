import Client from "../Client";

export default function initWorldDestructionTimer(client: Client) {
    const tag = 'world-destruction-timer';
    let timer: number | null = null;
    let end = 0;

    function stopTimer() {
        if (timer != null) {
            clearInterval(timer);
            timer = null;
        }
        client.sendEvent('worldDestructionTimer', null);
    }

    function update() {
        const left = end - Date.now();
        if (left <= 0) {
            stopTimer();
        } else {
            client.sendEvent('worldDestructionTimer', left / 1000);
        }
    }

    function startTimer(minutes: number) {
        end = Date.now() + minutes * 60 * 1000;
        if (timer != null) {
            clearInterval(timer);
        }
        update();
        timer = client.scope.interval(update, 100);
    }

    // Pattern: "Pamietaj, juz tylko X minut do momentu zniszczenia swiata."
    // May appear at end of a longer line prefixed with "W swoim umysle slyszysz glos Jezdzca Apokalipsy..."
    client.Triggers.registerTrigger(
        /Pamietaj, juz tylko (\d+) minut do momentu zniszczenia swiata\./,
        (line, matches) => {
            const minutes = parseInt(matches[1], 10);
            if (!isNaN(minutes) && minutes > 0) {
                startTimer(minutes);
            }
            return line;
        },
        tag
    );

    // Clear timer when leaving location or disconnecting
    client.on('gmcp.room.info', () => {
        // Don't clear on room change - the timer should persist
    });

    client.on('client.disconnect', () => {
        stopTimer();
    });
}
