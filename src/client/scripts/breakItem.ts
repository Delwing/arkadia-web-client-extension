import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

export default function initBreakItem(client: Client) {
    const COLOR = createColorFormat("#ff6347");
    const tag = "break-item";

    type Entry = { pattern: RegExp; command?: string };

    const entries: Entry[] = [
        { pattern: /^Nagle ([\w\- ]+) rozpruwa sie\..*/ },
        { pattern: /^Niestety zbyt mocnym ruchem rozrywasz (?:\w+ )+(\w+), drac go na bezwartosciowe pasy materialu\.$/ },
        { pattern: /^Probujesz zalozyc (?:\w+ )+line(?: z hakiem)?, ale ta peka ci w rekach ze starosci\.$/ },
        { pattern: /^Czujesz, ze (?:\w+ )+(\w+) po prostu rozpada ci sie w rekach\.$/ },
        { pattern: /^[A-Z][a-z]+ (?:[a-z]+ ){1,7}peka(?:ja)?!$/, command: "odloz zlamana bron" },
        { pattern: /^[A-Z][a-z]+ (?:[a-z]+ ){1,7}rozpada(?:ja)? sie!$/, command: "odloz zniszczona zbroje" },
        { pattern: /^(?:[A-Z][a-z-]+ ?){1,3} ([A-Z][a-z]+ |(?:\w+ ){3,4})rozpada(?:ja)? sie!/, command: "odloz zniszczona zbroje" },
    ];

    const format = (line: AnsiAwareBuffer) => line
        .prefix(`\n\n[  SPRZET  ] `, COLOR)
        .suffix("\n\n");

    entries.forEach(({ pattern, command }) => {
        client.Triggers.registerTrigger(pattern, (line) => {
            client.sendEvent("sound:play", { key: "beep" });
            client.sendEvent('breakItem', { text: line.text, command });
            const label = command ? ` >> ${command}` : " >> Sprzet zniszczony";
            client.FunctionalBind.set(label, () => {
                if (command) {
                    client.sendCommand(command);
                }
            }, true);
            return format(line);
        }, tag);
    });
}
