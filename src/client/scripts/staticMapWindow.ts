import Client from "../Client";
import eventBus from "@modules/core/eventBus";

export default function initStaticMapWindow(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    aliases.push(
        {
            pattern: /^\/mapa$/,
            callback: () => {
                // Open at current player location
                const roomId = client.Map?.currentRoom?.id;
                eventBus.emit('staticmap.popup.open', { roomId });
            }
        },
        {
            pattern: /^\/mapa\s+(\d+)$/,
            callback: (matches: RegExpMatchArray) => {
                // Open at specific room ID
                const roomId = parseInt(matches[1], 10);
                eventBus.emit('staticmap.popup.open', { roomId });
            }
        },
        {
            pattern: /^\/mapa\s+(.+)$/,
            callback: (matches: RegExpMatchArray) => {
                const input = matches[1].trim();

                // If it's a number, it was already handled by the pattern above
                if (/^\d+$/.test(input)) return;

                // Search for area by name
                const embedded = (globalThis as any).embedded;
                if (!embedded?.reader) {
                    client.print('Mapa nie jest zaladowana');
                    return;
                }

                const reader = embedded.reader;
                const areas = reader.getAreas?.() ?? [];
                const searchLower = input.toLowerCase();

                // Find matching area
                const matchingArea = areas.find((area: any) => {
                    const name = area?.getAreaName?.() ?? area?.areaName ?? area?.name ?? '';
                    return name.toLowerCase() === searchLower;
                });

                if (!matchingArea) {
                    // Try partial match
                    const partialMatch = areas.find((area: any) => {
                        const name = area?.getAreaName?.() ?? area?.areaName ?? area?.name ?? '';
                        return name.toLowerCase().includes(searchLower);
                    });

                    if (!partialMatch) {
                        client.print(`Nie znaleziono obszaru: ${input}`);
                        return;
                    }

                    // Use partial match - open by area ID
                    const areaId = partialMatch.getAreaId?.() ?? partialMatch.areaId ?? partialMatch.id;
                    eventBus.emit('staticmap.popup.open', { areaId });
                    return;
                }

                // Found exact match - open by area ID
                const areaId = matchingArea.getAreaId?.() ?? matchingArea.areaId ?? matchingArea.id;
                eventBus.emit('staticmap.popup.open', { areaId });
            }
        }
    );
}
