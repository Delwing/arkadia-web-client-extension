import Client from "../Client";
import { createAttackController } from "../utils/attackController";
import ObjectManager from "@client/ObjectManager.ts";

type ResolvedEnemy = {
    id: number;
    description?: string | null;
};

function getObjects(client: Client) {
    return client.ObjectManager.getObjectsOnLocation();
}

function resolveFromObjectList(client: Client, shortcut: string): ResolvedEnemy | null {
    const objectManager: ObjectManager = client.ObjectManager
    const objects = objectManager.getObjectsOnLocation();
    if (!objects) {
        return null;
    }
    const found = objects.find(obj => String(obj?.shortcut ?? "") === shortcut);
    if (!found || typeof found.num === "undefined" || found.num === null) {
        return null;
    }
    return {
        id: found.num,
        description: typeof found.desc === "string" ? found.desc : null,
    };
}

function resolveById(client: Client, id: number): ResolvedEnemy {
    const objects = getObjects(client);
    const description = objects?.find(obj => obj?.num === id)?.desc;
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
        return resolveById(client, parseInt(withPrefixMatch[1]));
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

    const attackController = createAttackController(client);

    const add = (matches: RegExpMatchArray) => {
        const resolved = resolveEnemy(client, matches[1] ?? matches[0]);
        if (!resolved) {
            client.println("Niepoprawne id przeciwnika.");
            return;
        }
        const { id, description } = resolved;
        const added = client.TeamManager.addEnemyToQueue(id);
        if (added) {
            const displayName = description ?? id;
            client.println(`Dodano ${displayName} do kolejki ataku.`);
        } else {
            client.println(`ob_${id} jest juz w kolejce ataku.`);
        }
    };

    const killNext = () => {
        const next = client.TeamManager.peekEnemyFromQueue?.();
        if (!next) {
            client.println("Kolejka ataku jest pusta.");
            return;
        }
        // Ally protection is a command hook, so this attack is gated like any
        // other regardless of the path that reached it.
        attackController.attackById(next);
    };

    list.push({
        pattern: /^\/q\s+((?:ob_)?[0-9]+)$/,
        callback: (matches: RegExpMatchArray) => add(matches),
    });

    list.push({
        pattern: /^\/nn$/,
        callback: killNext,
    });

    const clearQueue = () => {
        client.TeamManager.clearEnemyQueue();
        client.println("Wyczyszczono kolejke ataku.");
    };

    list.push({
        pattern: /^\/cq$/,
        callback: clearQueue,
    });
}
