import Client from "../Client";

interface ResolvedEnemy {
    id: string;
    description?: string;
}

function normalizeDescription(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

function resolveDescriptionFromObject(client: Client, predicate: (obj: any) => boolean): string | undefined {
    const objectManager: Client["ObjectManager"] | undefined = (client as any).ObjectManager;
    const objects = objectManager?.getObjectsOnLocation?.();
    if (!objects) {
        return undefined;
    }
    const match = objects.find(predicate);
    if (!match) {
        return undefined;
    }
    const anyMatch = match as any;
    return normalizeDescription(anyMatch?.desc ?? anyMatch?.name ?? anyMatch?.title);
}

function resolveDescriptionFromTeamManager(client: Client, id: string): string | undefined {
    const data = client.TeamManager?.getAccumulatedObjectsData?.();
    if (!data) {
        return undefined;
    }
    return normalizeDescription(data[id]?.desc);
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
    const id = String(found.num);
    const anyFound = found as any;
    const description = normalizeDescription(anyFound?.desc ?? anyFound?.name ?? anyFound?.title);
    return { id, description };
}

function resolveDescription(client: Client, id: string, fallbackShortcut?: string): string | undefined {
    const fromId = resolveDescriptionFromObject(client, obj => String(obj?.num ?? "") === id);
    if (fromId) {
        return fromId;
    }
    if (fallbackShortcut) {
        const fromShortcut = resolveDescriptionFromObject(client, obj => String(obj?.shortcut ?? "") === fallbackShortcut);
        if (fromShortcut) {
            return fromShortcut;
        }
    }
    return resolveDescriptionFromTeamManager(client, id);
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
        const id = withPrefixMatch[1];
        return {
            id,
            description: resolveDescription(client, id),
        };
    }

    if (/^\d+$/.test(trimmed)) {
        const resolved = resolveFromObjectList(client, trimmed);
        if (!resolved) {
            return null;
        }
        return {
            ...resolved,
            description: resolveDescription(client, resolved.id, trimmed) ?? resolved.description,
        };
    }

    return null;
}

export default function initAttackQueue(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;

    const add = (matches: RegExpMatchArray) => {
        const enemy = resolveEnemy(client, matches[1] ?? matches[0]);
        if (!enemy) {
            client.println("Niepoprawne id przeciwnika.");
            return;
        }
        const { id, description } = enemy;
        const added = client.TeamManager.addEnemyToQueue(id);
        const suffix = description ? ` (${description})` : "";
        if (added) {
            client.println(`Dodano ob_${id}${suffix} do kolejki ataku.`);
        } else {
            client.println(`ob_${id}${suffix} jest juz w kolejce ataku.`);
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
