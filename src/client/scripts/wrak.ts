import Client from "../Client";
import {createPassageLinker} from "../utils/passageLinker";

const CABIN_LOCATION = 25613;

// "Baccala" is how the map spells it - area 42, the one the wreck drifts around in.
const BACCALA_AREA = 42;

// The wreck itself turns up on a different patch of seabed every time the silt
// shifts off it, so spotting it lying there is the only signal there is. Matched
// as a line of its own - brackets and the closing period both optional - rather
// than as a substring, so prose that merely names the wreck cannot move the link.
const WRECK_PRESENT = /^\[?Rozbity zamulony wrak brygu\]?\.?$/;

export default function initWrak(client: Client) {
    const passage = createPassageLinker(client, {
        target: CABIN_LOCATION,
        direction: "down",
        reverse: "up",
        entranceArea: BACCALA_AREA,
        // Drawn as a plain down/up pair on the map, but walked with the commands
        // the game actually accepts: the dir_bind rewrites "d" and "u" on the way
        // out, and the special exit is what keeps the mapper following along.
        enterCommand: "wplyn do kabiny",
        leaveCommand: "wyplyn z kabiny",
    });

    client.Triggers.registerTrigger(WRECK_PRESENT, line => {
        const id = client.Map.currentRoom?.id;
        if (id !== undefined) {
            passage.link(id);
        }
        return line;
    }, "wrak");
}
