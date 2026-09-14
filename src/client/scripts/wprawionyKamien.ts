import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer, FormatStateSnapshot } from "@client/ansi/FormatState.ts";

/**
 * Kamien wprawiony w sprzet lub bizuterie kurczy sie z kazdym uzyciem, az w
 * koncu znika. Oba komunikaty gina w natloku walki, wiec podswietlamy je i
 * odcinamy pustymi liniami. Kurczenie jest zolte, znikniecie - pomaranczowe i
 * z krotkim mrugnieciem (klasa .gem-vanish-blink w src/web/style.css), bo to
 * moment, w ktorym kamien przepada na dobre.
 */
export default function initWprawionyKamien(client: Client) {
    const SHRINK: FormatStateSnapshot = createColorFormat("#ffff00");
    const VANISH: FormatStateSnapshot = {
        ...createColorFormat("#ff8c00"),
        bold: true,
        cssClass: "gem-vanish-blink",
    };
    const tag = "wprawiony-kamien";

    const entries: { pattern: RegExp; format: FormatStateSnapshot }[] = [
        // Wprawiony w ... ortoklaz wyraznie sie skurczyl.
        { pattern: /^Wprawion[aeoy] w .+ sie skurczyl[aoy]?\.$/, format: SHRINK },
        // Wprawiona w ... czarna perla znika w blysku swiatla.
        { pattern: /^Wprawion[aeoy] w .+ znika(?:ja)? w blysku swiatla\.$/, format: VANISH },
    ];

    entries.forEach(({ pattern, format }) => {
        client.Triggers.registerTrigger(pattern, (line: AnsiAwareBuffer) =>
            line.color([0, line.length], format).prefix("\n").suffix("\n"),
        tag);
    });
}
