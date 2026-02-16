import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";

const TRIGGER_TAG = "ostatnio-report";

const ACTIVE_COLOR = createColorFormat("#00ff00");
const INACTIVE_COLOR = createColorFormat("#ff0000");
const NAME_COLOR = createColorFormat("#ffa500");
const HEADER_COLOR = createColorFormat("#7cfc00");

export default function initOstatnio(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    if (!aliases) return;

    aliases.push({
        pattern: /^\/ostatnio$/,
        callback: () => {
            const members = client.TeamManager.getTeamMembers();
            if (members.length === 0) {
                client.println("Nie jestes w zadnej druzynie lub brak czlonkow.");
                return;
            }

            const results: { name: string; activity: string; active: boolean }[] = [];
            client.Triggers.removeByTag(TRIGGER_TAG);

            function queryNext(index: number) {
                if (index >= members.length) {
                    printReport();
                    return;
                }

                const member = members[index];
                client.Triggers.registerOneTimeTrigger(
                    /^Aktywnosc\s+:\s*(.*)$/,
                    (line, matches) => {
                        const activity = matches[1].trim();
                        const active = activity === "aktywny" || activity === "aktywna";
                        results.push({ name: member, activity, active });
                        queryNext(index + 1);
                        return null;
                    },
                    TRIGGER_TAG
                );
                client.sendCommand(`ostatnio ${member}`, false);
            }

            queryNext(0);

            function printReport() {
                const maxNameLen = Math.max(...results.map(r => r.name.length));
                const output = new AnsiAwareBuffer();
                output.appendBuffer(colorString("--- Aktywnosc druzyny ---", HEADER_COLOR));

                for (const r of results) {
                    output.append("\n");
                    output.appendBuffer(colorString(r.name, NAME_COLOR));
                    const padding = ' '.repeat(maxNameLen - r.name.length);
                    output.append(`${padding} : `);
                    output.appendBuffer(
                        colorString(r.activity, r.active ? ACTIVE_COLOR : INACTIVE_COLOR)
                    );
                }

                client.println(output);
            }
        },
    });
}
