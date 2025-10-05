import Client from "../Client";

function resolveIdFromObjectList(client: Client, shortcut: string): string | null {
    const objectManager: Client["ObjectManager"] | undefined = (client as any).ObjectManager;
    const objects = objectManager?.getObjectsOnLocation?.();
    if (!objects) {
        return null;
    }
    const found = objects.find(obj => String(obj?.shortcut ?? "") === shortcut);
    if (!found || typeof found.num === "undefined" || found.num === null) {
        return null;
    }
    return String(found.num);
}

function normalizeId(client: Client, input: string): string | null {
    if (!input) {
        return null;
    }
    const trimmed = input.trim();
    if (trimmed === "") {
        return null;
    }

    const withPrefixMatch = trimmed.match(/^ob_(\d+)$/);
    if (withPrefixMatch) {
        return withPrefixMatch[1];
    }

    if (/^\d+$/.test(trimmed)) {
        return resolveIdFromObjectList(client, trimmed);
    }

    return null;
}

export default function initAttackQueue(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;

    const add = (matches: RegExpMatchArray) => {
        const id = normalizeId(client, matches[1] ?? matches[0]);
        if (!id) {
            client.println("Niepoprawne id przeciwnika.");
            return;
        }
        const added = client.TeamManager.addEnemyToQueue(id);
        if (added) {
            client.println(`Dodano ob_${id} do kolejki ataku.`);
        } else {
            client.println(`ob_${id} jest juz w kolejce ataku.`);
        }
    };

    const killNext = () => {
        const next = client.TeamManager.shiftEnemyFromQueue();
        if (!next) {
            client.println("Kolejka ataku jest pusta.");
            return;
        }
        client.sendCommand(`zabij ob_${next}`);
    };

    list.push({
        pattern: /^\/q\s+((?:ob_)?[0-9]+)$/,
        callback: (matches: RegExpMatchArray) => add(matches),
    });

    list.push({
        pattern: /^\/nn$/,
        callback: killNext,
    });
}
