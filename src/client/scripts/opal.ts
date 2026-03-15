import Client from "../Client";
import {getLongDir, isDirection} from "@shared/map/directions";
import {stripPolishCharacters} from "../stripPolishCharacters";

/*
For better future implementation:
xxx odnajduje cos w podlodze jaskini.
W szczelinie miedzy dwiema skalnymi plytami podlogi odnajdujesz niewielki otwor.
 */

const UP_LOCATION = 17253;

export default function initOpal(client: Client) {
    let connectedId: number | false = false;

    client.on("enterLocation", (detail) => {
        const {id, direction} = detail as { id: number; direction: string | null };

        if (id !== UP_LOCATION || direction !== "down") {
            return;
        }

        const history = client.Map.locationHistory;
        if (history.length >= 2) {
            connectedId = history[history.length - 2];
            client.println(`[opal] stored connectedId=${connectedId}`);
        }
    });

    client.registerCommandHook("opal", (command) => {
        if (!connectedId) return undefined;
        if (client.Map.currentRoom?.id !== UP_LOCATION) return undefined;

        const cmd = stripPolishCharacters(command);
        if (!isDirection(cmd)) return undefined;
        if (getLongDir(cmd) !== "up") return undefined;

        client.println(`[opal] setting up exit to connectedId=${connectedId}`);
        client.Map.currentRoom.exits.up = connectedId;
        return undefined;
    });
}
