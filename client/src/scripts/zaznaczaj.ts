import Client from "../Client";
import appEventBus from "../events/app-event-bus";

export default function initZaznaczaj(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[],
) {
    let active = false;
    const highlights = new Set<number>();

    const sendHighlights = () => {
        appEventBus.emit('highlights', Array.from(highlights));
    };

    appEventBus.on('enterLocation', ({id}) => {
        if (!active) {
            return;
        }
        if (typeof id !== 'number') {
            return;
        }
        if (highlights.has(id)) {
            return;
        }
        highlights.add(id);
        sendHighlights();
    });

    aliases.push({
        pattern: /^\/zaznaczaj$/,
        callback: () => {
            active = true;
            highlights.clear();
            const currentId = client.Map.currentRoom?.id;
            if (typeof currentId === 'number') {
                highlights.add(currentId);
            }
            sendHighlights();
            client.println('Zaznaczanie lokalizacji wlaczone.');
        },
    });

    aliases.push({
        pattern: /^\/zaznaczaj-$/,
        callback: () => {
            active = false;
            highlights.clear();
            sendHighlights();
            client.println('Zaznaczanie lokalizacji wylaczone.');
        },
    });
}
