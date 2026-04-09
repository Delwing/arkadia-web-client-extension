import Client from "../Client";
import {isType} from "../Triggers";
import type {TransportTimerPayload} from "@client/types/transport";

const BOARD_CMDS = [
    "wem",
    "kup bilet",
    "wsiadz na statek",
    "wlm",
];
const BOARD_LABEL = BOARD_CMDS.join(";");

function bindShip(client: Client, commands: string[], label: string, beep: boolean) {
    if (beep) {
        client.sendEvent("sound:category", "transport");
    }
    client.FunctionalBind.setCategory('transport', label, () => {
        commands.forEach(cmd => client.sendCommand(cmd));
    }, false);
}

export default function initShips(client: Client) {
    let isOnBoard = false;

    client.on("transportTimer", (payload: TransportTimerPayload | null) => {
        isOnBoard = payload !== null;
    });

    const board = (beep: boolean) => (line: any) => {
        if (isOnBoard) {
            return line;
        }
        bindShip(client, BOARD_CMDS, BOARD_LABEL, beep);
        return line;
    };
    const disembark = (line: any) => {
        bindShip(client, ["zejdz ze statku"], "zejdz ze statku", true);
        client.sendEvent("refreshPositionWhenAble");
        return line;
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
    client.Triggers.registerTrigger(misc, board(true), "ships");


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
    const parent = client.Triggers.registerTrigger(isType("room.contents.object"))
    parent.registerChild(statki, board(false), "ships");
}
