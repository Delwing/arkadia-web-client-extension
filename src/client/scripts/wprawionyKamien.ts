import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";

/**
 * Kamien wprawiony w sprzet lub bizuterie kurczy sie z kazdym uzyciem, az w
 * koncu znika. Oba komunikaty gina w natloku walki, wiec podswietlamy je na
 * zolto i odcinamy pustymi liniami.
 */
export default function initWprawionyKamien(client: Client) {
    const COLOR = createColorFormat("#ffff00");
    const tag = "wprawiony-kamien";

    const patterns = [
        // Wprawiony w ... ortoklaz wyraznie sie skurczyl.
        /^Wprawion[aeoy] w .+ sie skurczyl[aoy]?\.$/,
        // Wprawiona w ... czarna perla znika w blysku swiatla.
        /^Wprawion[aeoy] w .+ znika(?:ja)? w blysku swiatla\.$/,
    ];

    patterns.forEach((pattern) => {
        client.Triggers.registerTrigger(pattern, (line) =>
            line.color([0, line.length], COLOR).prefix("\n").suffix("\n"),
        tag);
    });
}
