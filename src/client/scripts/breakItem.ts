import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";
import TriggerLine from "../triggers/TriggerLine";

export default function initBreakItem(client: Client) {
    const COLOR = findClosestColor("#ff6347");
    const tag = "break-item";

    type Entry = { pattern: RegExp; command?: string };

    const entries: Entry[] = [
        { pattern: /^Nagle (\w+) rozpruwa sie\..*/ },
        { pattern: /^Niestety zbyt mocnym ruchem rozrywasz (?:\w+ )+(\w+), drac go na bezwartosciowe pasy materialu\.$/ },
        { pattern: /^Probujesz zalozyc (?:\w+ )+line(?: z hakiem)?, ale ta peka ci w rekach ze starosci\.$/ },
        { pattern: /^Czujesz, ze (?:\w+ )+(\w+) po prostu rozpada ci sie w rekach\.$/ },
        { pattern: /^[A-Z][a-z]+ (?:[a-z]+ ){1,3}peka(?:ja)?!$/, command: "odloz zlamana bron" },
        { pattern: /^[A-Z][a-z]+ (?:[a-z]+ ){1,3}rozpada(?:ja)? sie!$/, command: "odloz zniszczona zbroje" },
        { pattern: /^(?:[A-Z][a-z-]+ ?){1,3} ([A-Z][a-z]+ |(?:\w+ ){3,4})rozpada(?:ja)? sie!/, command: "odloz zniszczona zbroje" },
    ];

    const format = (line: string) => `\n\n${client.prefix(line, colorString("[  SPRZET  ] ", COLOR))}\n\n`;

    entries.forEach(({ pattern, command }) => {
        client.Triggers.registerTrigger(pattern, (triggerLine) => {
            const line = triggerLine.text;
            client.sendEvent("sound:play", { key: "beep" });
            client.sendEvent('breakItem', { text: line, command });
            const label = command ? ` >> ${command}` : " >> Sprzet zniszczony";
            client.FunctionalBind.set(label, () => {
                if (command) {
                    client.sendCommand(command);
                }
            }, true);
            const formatted = format(line);
            return new TriggerLine(formatted);
        }, tag);
    });
}
