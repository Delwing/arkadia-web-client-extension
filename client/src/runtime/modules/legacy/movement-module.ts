import blockers from "../../../blockers.json";
import type { FeatureModule } from "../../feature-module";

import initMapAliases from "../../../scripts/mapAliases";
import initZaznaczaj from "../../../scripts/zaznaczaj";
import initTeamBlockers from "../../../scripts/teamBlockers";
import initNoExitHighlight from "../../../scripts/noExitHighlight";
import initMoveMode from "../../../scripts/moveMode";
import initCarriage from "../../../scripts/carriage";
import initIdz from "../../../scripts/idz";
import initGps from "../../../scripts/gps";
import initLocalizers from "../../../scripts/localizers";
import initShipLocalizers from "../../../scripts/shipLocalizers";
import initFollowSpecialExits from "../../../scripts/followSpecialExits";
import initMountain from "../../../scripts/mountain";
import initMultibinds from "../../../scripts/multibinds";
import initShortExits from "../../../scripts/shortExits";
import initShortcuts from "../../../scripts/shortcuts";
import initLetter from "../../../scripts/letter";
import initSeat from "../../../scripts/seat";
import initShips from "../../../scripts/ships";
import initTransportStops from "../../../scripts/transportStops";
import initBuses from "../../../scripts/buses";
import initGates from "../../../scripts/gates";

const movementModule: FeatureModule = {
    id: "legacy.movement",
    register({ client }) {
        const aliases = client.aliases;

        aliases.push({
            pattern: /\/fake (.*)/,
            callback: (matches: RegExpMatchArray) => {
                client.clientAdapter.output(
                    client.clientAdapter.parseAnsiPatterns(
                        client.onLine(matches[1], "combat.avatar"),
                    ),
                );
                // @ts-ignore - legacy call chain relies on flush side effects
                client.clientAdapter.flushMessageBuffer();
            },
        });

        initMapAliases(client, aliases);
        initZaznaczaj(client, aliases);

        blockers.forEach((blocker) => {
            const blockerPattern = blocker.type === "0" ? blocker.pattern : new RegExp(blocker.pattern);
            client.Triggers.registerTrigger(
                blockerPattern,
                (): undefined => {
                    client.Map.moveBack();
                },
                "blocker",
            );
        });

        initTeamBlockers(client);
        initNoExitHighlight(client);

        client.Triggers.registerTrigger(
            /^.*[pP]odazasz (|skradajac sie )za (.*)\.$/,
            (_, __, matches): undefined => {
                const tokenized = matches[2].split(" ");
                const direction = tokenized[tokenized.length - 1];
                client.Map.followMove(direction);
            },
            "follow",
        );

        client.Triggers.registerTrigger(
            /^Wraz z .* (?:jedziesz|zjezdzasz|wjezdzasz) .* (?:wozem|bryczka|dylizansem) (?:na )?(?<direction>.*?)(?:,.*)?\.$/,
            (_r, _l, matches: any): undefined => {
                client.Map.followMove(matches.groups.direction);
            },
            "follow",
        );

        const movePattern = /^Ruszasz (?:niespiesznie|marszem|truchtem|biegiem|szybkim biegiem) na (?<direction>[A-Za-z\-]+)\.$/;
        client.Triggers.registerMultilineTrigger(
            [/^Wykonuje komende 'idz /],
            (_, line): undefined => {
                const lines = line.split("\n");
                if (lines.length > 1) {
                    const matches = lines[1].match(movePattern);
                    if (matches?.groups?.direction) {
                        client.Map.followMove(matches.groups.direction);
                    }
                } else {
                    client.Map.refresh();
                    client.Map.refreshPosition = true;
                }
            },
            "follow",
            { stayOpenLines: 1 },
        );

        client.Triggers.registerTrigger(
            /^Wykonywanie komendy 'idz.*' zostaje przerwane\./,
            (): undefined => {
                client.Map.refreshPosition = false;
            },
        );

        client.Triggers.registerTrigger(
            "ENTER by przejsc dalej",
            (): string => {
                client.sendCommand("");
                return "";
            },
        );

        initShips(client);
        initTransportStops(client);
        initBuses(client);
        initGates(client);
        initSeat(client);
        initMoveMode(client);
        initCarriage(client);
        initIdz(client, aliases);
        initGps(client);
        initLocalizers(client);
        initShipLocalizers(client);
        initFollowSpecialExits(client);
        initMountain(client);
        initMultibinds(client, aliases);
        initShortExits(client);
        initShortcuts(client, aliases);
        initLetter(client, aliases);
    },
};

export default movementModule;
