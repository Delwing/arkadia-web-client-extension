import Client from "../Client";
import {createPassageLinker} from "../utils/passageLinker";

const HOLE_LOCATION = 17253;

// Every cave room the hole in the floor is known to open in. Only one of them
// holds it at a time, so whichever one we confirm takes the link off the rest.
const ENTRANCES = [17238, 17232, 24459, 17247, 17227] as const;

const DISCOVERY_PATTERNS = [
    /^.+ odnajduje cos w podlodze jaskini\.$/,
    /^W szczelinie miedzy dwiema skalnymi plytami podlogi odnajdujesz niewielki otwor\.$/,
];

export default function initOpal(client: Client) {
    const passage = createPassageLinker(client, {
        target: HOLE_LOCATION,
        direction: "down",
        reverse: "up",
        candidates: ENTRANCES,
    });

    // The hole being dug out in front of us is the earliest signal there is.
    DISCOVERY_PATTERNS.forEach(pattern => client.Triggers.registerTrigger(pattern, line => {
        const id = client.Map.currentRoom?.id;
        if (id !== undefined) {
            passage.link(id);
        }
        return line;
    }, "opal"));

    // Missing that moment is common enough — walking down through the hole says
    // the same thing, and the room we came from is the one holding it.
    client.on("enterLocation", (detail) => {
        const {id, direction} = detail as { id: number; direction: string | null };

        if (id !== HOLE_LOCATION || direction !== "down") {
            return;
        }

        const history = client.Map.locationHistory;
        if (history.length >= 2) {
            passage.link(history[history.length - 2]);
        }
    });
}
