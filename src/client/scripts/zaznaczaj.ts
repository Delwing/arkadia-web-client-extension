import Client from "../Client";

export default function initZaznaczaj(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[],
) {
    let active = false;
    const highlights = new Set<number>();

    const sendHighlights = () => {
        client.sendEvent('highlights', Array.from(highlights));
    };

    client.on('enterLocation', (payload) => {
        if (!active) {
            return;
        }
        const id = (payload as { id?: number })?.id;
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
        callback: (_matches: RegExpMatchArray) => {
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
        callback: (_matches: RegExpMatchArray) => {
            active = false;
            highlights.clear();
            sendHighlights();
            client.println('Zaznaczanie lokalizacji wylaczone.');
        },
    });
}
