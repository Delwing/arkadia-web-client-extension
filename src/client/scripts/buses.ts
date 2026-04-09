import Client from "../Client";

const DYLIZANS_CMDS = ["wem", "wsiadz do dylizansu", "wlm"];
const DILIZANS_LABEL = DYLIZANS_CMDS.join(";");

const POWOZ_CMDS = ["wem", "wsiadz do wozu", "wsiadz do powozu", "wlm"];
const POWOZ_LABEL = POWOZ_CMDS.join(";");

const BRYCZKA_CMDS = ["wem", "usiadz na bryczce", "wlm"];
const BRYCZKA_LABEL = BRYCZKA_CMDS.join(";");

function bindBus(client: Client, commands: string[], label: string, beep: boolean) {
    if (beep) {
        client.sendEvent("sound:category", "transport");
    }
    client.FunctionalBind.setCategory('transport', label, () => {
        commands.forEach(cmd => client.sendCommand(cmd));
    }, false);
}

export default function initBuses(client: Client) {
    const boardDylizans = (line: any) => {
        bindBus(client, DYLIZANS_CMDS, DILIZANS_LABEL, true);
        return line;
    };
    const exitPowozPatterns: Array<RegExp | string> = [
        /.*owoz cicho skrzypiac zatrzymuje sie\.$/,
        /.*kolysanie ustaje w koncu i woz zatrzymuje sie\.$/,
        /.*Powoli pojazd zaczyna tracic predkosc.*/,
        "Woz cicho skrzypiac zatrzymuje sie.",
        "Otwarty jadacy powoz powoli zatrzymuje sie.",
    ];

    const boardPowoz = (line: any) => {
        const text = line.text;
        if (text.includes("powoli rusza w droge")) return line;
        if (exitPowozPatterns.some(p => typeof p === "string" ? text === p : p.test(text))) {
            return line;
        }
        bindBus(client, POWOZ_CMDS, POWOZ_LABEL, false);
        return line;
    };

    const exitPowoz = (line: any) => {
        bindBus(client, ["wyjscie"], "wyjscie", true);
        return line;
    };
    const boardBryczka = (line: any) => {
        bindBus(client, BRYCZKA_CMDS, BRYCZKA_LABEL, false);
        return line;
    };
    const exitBryczka = (line: any) => {
        bindBus(client, ["wstan"], "wstan", false);
        return line;
    };

    client.Triggers.registerTrigger(
        [
            /.*dylizans powoli zatrzymuje sie.*/,
            /.*i wsiada do.*dylizansu/
        ],
        boardDylizans,
        "buses"
    );

    client.Triggers.registerTrigger(/[A-Za-z]+ stojacy dylizans/, (line, _, type) => {
        if (type !== "room.contents.object") {
            return line;
        }
        return boardDylizans(line);
    });

    client.Triggers.registerTrigger([
        /kupiecki stojacy (po|)woz$/,
        "drewniany stojacy woz",
        "otwarty stojacy powoz",
        "kupiecki stojacy woz z plandeka",
    ], (line, _, type) => {
        if (type !== "room.contents.object") {
            return line;
        }
        return boardPowoz(line);
    }, "buses", {caseInsensitive: true});

    const boardPowozPatterns: Array<RegExp | string> = [
        /.*(?:po)?woz.*powoli zatrzymuje sie\./,
        /.*i wsiada do.*powozu/,
    ];
    client.Triggers.registerTrigger(boardPowozPatterns, boardPowoz, "buses");

    client.Triggers.registerTrigger(exitPowozPatterns, exitPowoz, "buses");

    client.Triggers.registerTrigger(
        [/^.*siada w .*bryczce\.$/, /^.*siada na .*wozie\.$/],
        boardBryczka,
        "buses"
    );
    client.Triggers.registerTrigger(
        [/^.*zsiada z .*bryczki\.$/, /^.*zsiada z .*wozu\.$/],
        exitBryczka,
        "buses"
    );
}
