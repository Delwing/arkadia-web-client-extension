import Client from "../Client";
import type { RecordingRequestResult } from "@shared/events";

/**
 * Start and stop a manual recording from the command line - the same
 * recording the Nagrania window starts, so it shows up there once saved.
 */
export default function initRecordingAliases(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[],
) {
    const list = aliases ?? client.aliases;

    client.on("recording.request.done", ({ request, active, started }: RecordingRequestResult) => {
        if (request.action === "start") {
            client.println(started
                ? `Nagrywanie rozpoczete: ${started}. Zakoncz przez /nagrywaj_stop.`
                : `Nagrywanie juz trwa: ${active}. Zakoncz je przez /nagrywaj_stop.`);
            return;
        }
        if (!active) {
            client.println("Nic sie nie nagrywa.");
            return;
        }
        client.println(request.save
            ? `Nagranie zapisane: ${active}.`
            : `Nagranie odrzucone: ${active}.`);
    });

    list.push({
        pattern: /^\/nagrywaj(?:\s+(.+))?$/,
        callback: (matches: RegExpMatchArray) => {
            client.sendEvent("recording.request", { action: "start", name: matches[1]?.trim() || undefined });
        },
    });

    list.push({
        pattern: /^\/nagrywaj_stop$/,
        callback: () => {
            client.sendEvent("recording.request", { action: "stop", save: true });
        },
    });

    list.push({
        pattern: /^\/nagrywaj_anuluj$/,
        callback: () => {
            client.sendEvent("recording.request", { action: "stop", save: false });
        },
    });
}
