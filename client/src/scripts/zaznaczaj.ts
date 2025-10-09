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

    client.addEventListener('enterLocation', (ev: CustomEvent<{ id: number }>) => {
        if (!active) {
            return;
        }
        const id = ev.detail?.id;
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
