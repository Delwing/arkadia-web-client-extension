import Client from "../Client";

type ResolvedEnemy = {
    id: string;
    description?: string | null;
};

function getObjects(client: Client) {
    const objectManager: Client["ObjectManager"] | undefined = (client as any).ObjectManager;
    return objectManager?.getObjectsOnLocation?.();
}

function resolveFromObjectList(client: Client, shortcut: string): ResolvedEnemy | null {
    const objectManager: Client["ObjectManager"] | undefined = (client as any).ObjectManager;
    const objects = objectManager?.getObjectsOnLocation?.();
    if (!objects) {
        return null;
    }
    const found = objects.find(obj => String(obj?.shortcut ?? "") === shortcut);
    if (!found || typeof found.num === "undefined" || found.num === null) {
        return null;
    }
    return {
        id: String(found.num),
        description: typeof found.desc === "string" ? found.desc : null,
    };
}

function resolveById(client: Client, id: string): ResolvedEnemy {
    const objects = getObjects(client);
    const description = objects?.find(obj => String(obj?.num ?? "") === id)?.desc;
    return { id, description: typeof description === "string" ? description : null };
}

function resolveEnemy(client: Client, input: string): ResolvedEnemy | null {
    if (!input) {
        return null;
    }
    const trimmed = input.trim();
    if (trimmed === "") {
        return null;
    }

    const withPrefixMatch = trimmed.match(/^ob_(\d+)$/);
    if (withPrefixMatch) {
        return resolveById(client, withPrefixMatch[1]);
    }

    if (/^\d+$/.test(trimmed)) {
        return resolveFromObjectList(client, trimmed);
    }

    return null;
}

export default function initAttackQueue(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;

    const add = (matches: RegExpMatchArray) => {
        const resolved = resolveEnemy(client, matches[1] ?? matches[0]);
        if (!resolved) {
            client.println("Niepoprawne id przeciwnika.");
            return;
        }
        const { id, description } = resolved;
        const added = client.TeamManager.addEnemyToQueue(id);
        if (added) {
            const suffix = description ? ` (${description})` : "";
            client.println(`Dodano ob_${id}${suffix} do kolejki ataku.`);
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
