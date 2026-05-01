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

    const boardPowoz = (line: any) => {
        if (line.text.includes("powoli rusza w droge")) return line;
        bindBus(client, POWOZ_CMDS, POWOZ_LABEL, false);
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
        /.*i wsiada do.*dylizansu/,
        boardDylizans,
        "buses"
    );

    client.Triggers.registerTrigger(
        /.*i wsiada do.*powozu/,
        boardPowoz,
        "buses"
    );

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
