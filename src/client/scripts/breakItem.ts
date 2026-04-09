import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

export default function initBreakItem(client: Client) {
    const COLOR = createColorFormat("#ff6347");
    const tag = "break-item";

    type Entry = { pattern: RegExp; command?: string; noBind?: boolean };

    const entries: Entry[] = [
        { pattern: /^Nagle ([\w\- ]+) rozpruwa sie\..*/ },
        { pattern: /^Niestety zbyt mocnym ruchem rozrywasz (?:\w+ )+(\w+), drac go na bezwartosciowe pasy materialu\.$/ },
        { pattern: /^Probujesz zalozyc (?:\w+ )+line(?: z hakiem)?, ale ta peka ci w rekach ze starosci\.$/ },
        { pattern: /^Czujesz, ze (?:\w+ )+(\w+) po prostu rozpada ci sie w rekach\.$/ },
        { pattern: /^[A-Z][a-z]+ (?:[a-z]+ ){1,7}peka(?:ja)?!$/, command: "odloz zlamana bron" },
        { pattern: /^[A-Z][a-z]+ (?:[a-z]+ ){1,7}rozpada(?:ja)? sie!$/, command: "odloz zniszczona zbroje" },
        { pattern: /^[A-Z][a-z-]+ (?:[a-z]+ ){0,6}[A-Z][a-z]+ peka(?:ja)?!$/, noBind: true },
        { pattern: /^[A-Z][a-z-]+ (?:[a-z]+ ){0,6}[A-Z][a-z]+ rozpada(?:ja)? sie!$/, noBind: true },
    ];

    const format = (line: AnsiAwareBuffer) => line
        .prefix(`\n\n[  SPRZET  ] `, COLOR)
        .suffix("\n\n");

    client.Triggers.registerTrigger(
        /^Odkladasz (?:zniszczon[aey]|zlaman[aey]) /,
        (line) => { client.sendEvent('breakItem', null); return line; },
        tag,
    );

    entries.forEach(({ pattern, command, noBind }) => {
        client.Triggers.registerTrigger(pattern, (line) => {
            client.sendEvent("sound:category", "gear");
            if (!noBind) {
                client.sendEvent('breakItem', { text: line.text, command });
                const label = command ? ` >> ${command}` : " >> Sprzet zniszczony";
                client.FunctionalBind.set(label, () => {
                    if (command) {
                        client.sendCommand(command);
                    }
                }, true);
            }
            return format(line);
        }, tag);
    });
}
