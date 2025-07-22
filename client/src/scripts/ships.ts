import Client from "../Client";

const BOARD_CMDS = [
    "wem",
    "kup bilet",
    "wsiadz na statek",
    "wlm",
];
const BOARD_LABEL = BOARD_CMDS.join(";");

function bindShip(client: Client, commands: string[], label: string, beep: boolean) {
    if (beep) {
        client.playSound("beep");
    }
    client.FunctionalBind.set(label, () => {
        client.sendEvent("refreshPositionWhenAble");
        commands.forEach(cmd => client.sendCommand(cmd));
    });
}

export default function initShips(client: Client) {
    const board = (beep: boolean) => (
        _raw: string,
        _line: string,
        _matches: RegExpMatchArray,
        _type: string
    ) => {
        bindShip(client, BOARD_CMDS, BOARD_LABEL, beep);
        return undefined;
    };
    const disembark = () => {
        bindShip(client, ["zejdz ze statku"], "zejdz ze statku", true);
        return undefined;
    };

    const boardPatterns = [
        /.*(Wszyscy na poklad!.*|przybija wielki trojmasztowy galeon\.)$/
    ]
    client.Triggers.registerTrigger(boardPatterns, board(true), "ships");

    const disembarkPatterns = [
        /^(?!Ktos|Jakis|Jakas).*(Doplynelismy.*(Mozna|w calej swej)|Marynarze sprawnie cumuja)/
    ]
    client.Triggers.registerTrigger(disembarkPatterns, disembark, "ships");

    const misc = [
        /^[a-zA-Z]+ [a-z]+ prom[^a-z]$/,
        /^Prom(\.|,| i)/,
        /^Barka(\.|,| i)/,
        /.*(rypa|ratwa|rom|arka) przybija do brzegu\.$/,
        /^Tratwa(\.|,| i)/,
        /^Rzeczna tratwa(\.|,| i)/,
    ]
    client.Triggers.registerTrigger(misc, board(false), "ships");


    const statki = [
        /^([A-Za-z]+) (statek|knara)(\.|,| i)/,
        /^([A-Za-z]+) ([a-z]+) statek(\.|,| i)/,
        /Tajemniczy okret/,
        /Wielki trojmasztowy galeon(\.|,| i)/,
        /Stara niewielka szkuta/,
        /Smukly drakkar/,
        /Szeroka knara/,
        /Mala feluka/,
        /Stara szkuta/,
        /Stara niewielka szkuta/,
        /Stary buzar/,
        /Smukly bryg/,
        /Smukly majestatyczny bryg/,
        /Nieduzy barkas/,
        /Nieduza rzeczna barka/,
        /Wielka galera/,
        /Niewielki dwumasztowy statek/,
        /Dluga niezgrabna barka/,
        /Plaskodenny skeid/,
    ];
    client.Triggers.registerTrigger(statki, board(false), "ships");
}
