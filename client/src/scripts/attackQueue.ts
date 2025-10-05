import Client from "../Client";

function normalizeId(input: string): string | null {
    if (!input) {
        return null;
    }
    const trimmed = input.trim();
    if (trimmed === "") {
        return null;
    }
    const withoutPrefix = trimmed.startsWith("ob_") ? trimmed.slice(3) : trimmed;
    if (!/^[0-9]+$/.test(withoutPrefix)) {
        return null;
    }
    return withoutPrefix;
}

export default function initAttackQueue(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;

    const add = (matches: RegExpMatchArray) => {
        const id = normalizeId(matches[1] ?? matches[0]);
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
        pattern: /^\/q\s+(?:ob_)?([0-9]+)$/,
        callback: (matches: RegExpMatchArray) => add(matches),
    });

    list.push({
        pattern: /^\/nn$/,
        callback: killNext,
    });
}
