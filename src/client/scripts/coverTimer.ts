import Client from "../Client";

export default function initCoverTimer(client: Client) {
    const tag = 'cover-timer';
    const COVER_TIME = 5; // seconds
    let timer: number | null = null;
    let end = 0;

    const successPatterns = [
        /^[ >]*Zrecznie zaslaniasz ([\[a-zA-Z (),!\]]+) przed ciosami ([a-zA-Z (),!\]]+)\.$/,
        /^[ >]*Z wprawa stajesz pomiedzy ([\[a-zA-Z (),!\]]+) a ([\[a-zA-Z (),!\]]+), przyjmujac na siebie nadchodzace ciosy\.$/,
        /^[ >]*Stajesz u boku ([a-zA-Z (),!\]]+), gotow w kazdej chwili zaslonic .* przed nadchodzacym niebezpieczenstwem\.$/,
        /^[ >]*Unosisz swoja .+? i szybko przesuwasz sie za .+?, kryjac sie przed atakami/,
        /^[ >]*Zdecydowanym krokiem wysuwasz sie przed [\[a-zA-Z (),!\]]+, zimnym spojrzeniem dajac wszystkim do zrozumienia, ze moga sie do (niego|niej) zblizyc jedynie po twoim trupie\.$/
    ];

    const failurePatterns = [
        /^[ >]*Probujesz zaslonic ([a-zA-Z (),!]+) przed ciosami ([a-zA-Z (),!]+), jednak nie jestes w stanie tego uczynic\.$/,
        /^Na rozkaz .* probujesz zaslonic (.*) przed ciosami (.*), jednak nie jestes w stanie tego uczynic\.$/,
        /[ >]*Unosisz swoja .+? i przesuwasz sie w strone .+?, bezskutecznie probujac/,
        /(\w+(?: \w+){0,4}?) unosi swoja .+? i szybko przesuwa sie w (twoja strone|strone .+?), bezskutecznie probujac skryc sie za toba przed atakami .+\.$/,
        /(\w+(?: \w+){0,4}?) unosi swoja .+? i szybko przesuwa sie w (twoja strone|strone .+?), bezskutecznie probujac skryc sie za (nia|nim|toba) przed atakami .+\.$/
    ];

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
        end = Date.now() + COVER_TIME * 1000;
        if (timer != null) {
            clearInterval(timer);
        }
        update();
        timer = client.scope.interval(update, 100);
    }

    [...successPatterns, ...failurePatterns].forEach(pattern => {
        client.Triggers.registerTrigger(pattern, (line) => {
            startTimer();
            return line;
        }, tag);
    });

    client.on('maneuverAttempted', () => {
        startTimer();
    });
}
