import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";

export default function initDrowning(client: Client) {
    const tag = "drowning";
    const CYAN = createColorFormat("#00ffff");

    const drowningPatterns = [
        "Ponad twoja glowa przelamuje sie potezna sztormowa fala, ktora wciska cie w glebine.",
        "Nie masz juz sil walczyc z zywiolem i dajesz sie poniesc pradowi na dol."
    ];

    client.Triggers.registerTrigger(drowningPatterns, (line) => {
        // If pauser is on, move back on map first
        if (client.Map.paused) {
            client.Map.moveBack();
        }

        client.Map.move("d", true);

        return line.color([0, line.length], CYAN);
    }, tag);
}
