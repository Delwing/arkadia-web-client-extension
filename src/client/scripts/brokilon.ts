import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";

export default function initBrokilon(client: Client) {
    const tag = "brokilon";
    const ORANGE_RED = createColorFormat("#ff4500");

    function formatLine(line: AnsiAwareBuffer, prefixText: string): AnsiAwareBuffer {
        const result = new AnsiAwareBuffer();
        result.append(prefixText, ORANGE_RED);
        result.appendBuffer(line.color([0, line.length], ORANGE_RED));
        return result;
    }

    // 1. Pulapka (trap)
    client.Triggers.registerTrigger([
        /^Nagle .* podlatuje w gore, robi pol salta i zawisa bezwladnie, przywiazan. do drzewa, by dyndac jak kukielka\.$/,
        "Nagle czujesz, ze cos oplata twa noge... ziemia w zawrotnym tempie zamienia sie miejscami z niebem. Zwisasz teraz, przywiazany za noge rzemieniem, dyndajac jak kukielka.",
        /rzemienna petla/i,
    ], (line) => {
        if (line.text.startsWith("Nagle czujesz")) {
            client.Map.moveBack();
        }
        client.FunctionalBind.set("przetnij rzemien");
        return formatLine(line, "[ PULAPKA ]  ");
    }, tag);

    // 2. Strzaly (arrows)
    client.Triggers.registerTrigger([
        "Nadlatujaca ze swistem strzala wbija ci sie w korpus.",
        "Nagle jakas strzala wbija ci sie w korpus.",
        "Nagle jakas strzala wbija sie",
        "W ziemie wbila sie z niesamowita predkoscia dluga strzala.",
        "Nadlatujaca ze swistem strzala wbija sie",
    ], (line) => {
        return formatLine(line, "[ STRZALY ]  ");
    }, tag);

    // 3. Rusalka (charm)
    client.Triggers.registerTrigger([
        "zastyga nagle w miejscu.",
        "Mimowolnie twoj wzrok krzyzuje sie ze wzrokiem zielonowlosej drobnej rusalki. Jej piekno wprost oszalamia cie...",
    ], (line) => {
        client.println(colorString("UROK RUSALKI", ORANGE_RED).prepend("\n").append("\n"));
        client.FunctionalBind.set("/zz rusalke");
        return formatLine(line, "[ UROK ]  ");
    }, tag);

    // 4. Rusalka2 (charm - can't attack)
    client.Triggers.registerTrigger(
        "Nie jestes w stanie skrzywdzic tak pieknej istoty!",
        (line) => {
            client.FunctionalBind.set("/zz rusalke");
            return formatLine(line, "[ UROK ]  ");
        },
        tag
    );
}
