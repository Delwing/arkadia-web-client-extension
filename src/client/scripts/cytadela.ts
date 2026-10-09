import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {createColorFormat} from "@modules/core/Colors";
import {getLongDir, getShortDir} from "@shared/map/directions";

const RED = "#ff3030";
const RED_FORMAT = createColorFormat(RED);

const DANGER = /^Masz nieodparte wrazenie, ze na (.+?)(?: i na (.+))? stad czai sie niebezpieczenstwo\.$/;
const DANGER_START = "Masz nieodparte wrazenie, ze na ";

// What a teammate says through the bind below. Only spoken lines: a shout carries from other
// rooms, and the exits would then be read against the wrong one.
const WARNING = /^(?:.+? mowi|Mowisz)[^:]*: Niebezpieczenstwo na (.+?)(?: i na (.+))?\.$/;
const WARNING_START = ": Niebezpieczenstwo na ";

/**
 * Cytadela: the game warns which exits are deadly. Those exits go red, and while the mapper
 * trusts its position the rooms behind those exits stay marked on the map until reload.
 * Anyone in a team gets a bind to pass the warning on, and the others' clients
 * mark the map from what they hear.
 */
export default function initCytadela(client: Client) {
    let highlighter: ReturnType<typeof client.Map.createHighlighter> | null = null;

    const targetOf = (direction: string): number | undefined => {
        const room = client.Map.currentRoom;
        if (!room) return undefined;
        const long = getLongDir(direction);
        return room.exits?.[long as keyof typeof room.exits]
            ?? room.specialExits?.[getShortDir(direction)]
            ?? room.specialExits?.[direction];
    };

    // "na polnoc, na wschod i na zachod" - the first group may carry a comma list.
    const directionsOf = (matches: RegExpMatchArray) => [matches[1], matches[2]]
        .filter((part): part is string => !!part)
        .flatMap(part => part.split(/,\s*(?:na\s+)?/))
        .map(direction => direction.trim())
        .filter(Boolean);

    const mark = (line: AnsiAwareBuffer, directions: string[], searchFrom: number) => {
        // Only the exits go red; searching past the fixed lead-in keeps other words out.
        const text = line.text;
        let cursor = searchFrom;
        for (const direction of directions) {
            const start = text.indexOf(direction, cursor);
            if (start < 0) continue;
            line.color([start, start + direction.length], RED_FORMAT);
            cursor = start + direction.length;
        }
        // Prefixed after coloring, so the offsets above still match the game text.
        line.prefix(" ");
        line.prefix("[ PULAPKA ]", RED_FORMAT);

        if (client.Map.isLost || !client.Map.currentRoom) return;
        const rooms = directions
            .map(targetOf)
            .filter((id): id is number => typeof id === "number");
        if (rooms.length > 0) {
            highlighter ??= client.Map.createHighlighter({color: RED});
            highlighter.add(rooms);
        }
    };

    const warningFor = (directions: string[]) => {
        const last = directions[directions.length - 1];
        const rest = directions.slice(0, -1);
        const list = rest.length > 0 ? `${rest.join(", na ")} i na ${last}` : last;
        return `'Niebezpieczenstwo na ${list}.`;
    };

    client.Triggers.registerTrigger(DANGER, (line, matches) => {
        if (!matches) return line;
        const directions = directionsOf(matches);
        mark(line, directions, DANGER_START.length);

        if (directions.length > 0 && client.TeamManager.isInAnyTeam()) {
            client.FunctionalBind.set(warningFor(directions));
        }
        return line;
    }, "cytadela");

    client.Triggers.registerTrigger(WARNING, (line, matches) => {
        if (!matches) return line;
        const searchFrom = line.text.indexOf(WARNING_START) + WARNING_START.length;
        mark(line, directionsOf(matches), searchFrom);
        return line;
    }, "cytadela");
}
