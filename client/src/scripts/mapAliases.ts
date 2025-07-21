import Client from "../Client";
import { longToShort } from "../MapHelper";
import { getShortcut } from "./shortcuts";

export default function initMapAliases(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    aliases.push(
        {
            pattern: /\/cofnij$/,
            callback: () => {
                client.Map.moveBack();
            }
        },
        {
            pattern: /\/move (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                client.Map.move(matches[1]);
            }
        },
        {
            pattern: /\/ustaw (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                client.Map.setMapRoomById(parseInt(matches[1]));
            }
        },
        {
            pattern: /\/prowadz (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                const dest = getShortcut(matches[1]) ?? matches[1];
                client.sendEvent('leadTo', dest);
            }
        },
        {
            pattern: /\/prowadz-$/,
            callback: () => {
                client.sendEvent('leadTo');
            }
        },
        {
            pattern: /\/go$/,
            callback: () => {
                const embedded: any = (window as any).embedded;
                const room: any = client.Map.currentRoom;
                if (!embedded?.destinations?.length || !room) return;
                const target = parseInt(embedded.destinations[0]);
                const path = client.Map.mapReader.getPath(room.id, target);
                if (!path || path.length < 2) return;
                const next = parseInt(path[1]);
                const allExits = Object.assign({}, room.exits ?? {}, room.specialExits ?? {});
                const entry = Object.entries(allExits).find(([_, id]) => id === next);
                if (!entry) return;
                const dir = entry[0];
                client.sendCommand(longToShort[dir] ?? dir);
            }
        },
        {
            pattern: /\/zlok$/,
            callback: () => {
                client.Map.refresh();
            }
        }
    );
}
