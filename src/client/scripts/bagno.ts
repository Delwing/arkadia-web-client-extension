import Client from "../Client";
import {createPassageLinker} from "../utils/passageLinker";

const SLAB_LOCATION = 24299;

const VARIENO_AREA = 44;

const SLAB_REVEALED = /^Bagno odslonilo tu fragment kamiennej plyty\.$/;

export default function initBagno(client: Client) {
    const passage = createPassageLinker(client, {
        target: SLAB_LOCATION,
        direction: "down",
        reverse: "up",
        entranceArea: VARIENO_AREA,
    });

    client.Triggers.registerTrigger(SLAB_REVEALED, line => {
        // Only whoever is steering reads the compass to find their way; a follower
        // would get a link they never walk, so leave their map alone.
        const team = client.TeamManager;
        if (team.isInAnyTeam() && !team.isLeader()) {
            return line;
        }
        const id = client.Map.currentRoom?.id;
        if (id !== undefined) {
            passage.link(id);
        }
        return line;
    }, "bagno");
}
