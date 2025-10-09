import Client from "../Client";

type FollowMatches = RegExpMatchArray & { groups?: { direction?: string } };

const FOLLOW_TEAM_PATTERN = /^.*[pP]odazasz (|skradajac sie )za (.*)\.$/;
const FOLLOW_VEHICLE_PATTERN = /^Wraz z .* (?:jedziesz|zjezdzasz|wjezdzasz) .* (?:wozem|bryczka|dylizansem) (?:na )?(?<direction>.*?)(?:,.*)?\.$/;
const RUN_COMMAND_PATTERN = /^Wykonuje komende 'idz /;
const RUNNING_PATTERN = /^Ruszasz (?:niespiesznie|marszem|truchtem|biegiem|szybkim biegiem) w droge\./;
const RUN_DIRECTION_PATTERN = /^Ruszasz (.+?) na (?<direction>[A-Za-z ]+)\.$/i;

export default function initFollow(client: Client) {
    client.Triggers.registerTrigger(FOLLOW_TEAM_PATTERN, (_raw, _line, matches): undefined => {
        const target = matches[2];
        const tokens = target.split(" ");
        const direction = tokens[tokens.length - 1];
        const result = client.Map.move(direction);
        if (result.moved) {
            return;
        }
        client.Map.followMove(target);
    }, "follow");

    client.Triggers.registerTrigger(FOLLOW_VEHICLE_PATTERN, (_raw, _line, matches: FollowMatches): undefined => {
        const direction = matches.groups?.direction;
        if (direction) {
            client.Map.followMove(direction);
        }
    }, "follow");

    client.Triggers.registerTrigger([RUN_COMMAND_PATTERN, RUNNING_PATTERN], (): undefined => {
        client.sendEvent("refreshPositionWhenAble");
    });

    client.Triggers.registerTrigger([RUN_COMMAND_PATTERN, RUNNING_PATTERN, RUN_DIRECTION_PATTERN], (_raw, _line, matches: FollowMatches): undefined => {
        const direction = matches.groups?.direction?.trim() ?? matches[2]?.trim();
        if (direction) {
            client.Map.followMove(direction);
        }
    }, "follow");

    client.Triggers.registerTrigger(/^Wykonywanie komendy 'idz.*' zostaje przerwane\./, (): undefined => {
        client.Map.refreshPosition = false;
    });
}
