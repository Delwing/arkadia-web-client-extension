import Client from "@client/Client";
import { objectListFilters } from "../objectListFilters";
import { fuzzyMatch } from "@client/utils/fuzzyMatch";

const FUZZY_THRESHOLD = 0.6;

type EnemyStatus = {
    paralyzed: boolean;
    brokenDefense: boolean;
};

const enemyStatusMap = new Map<string, EnemyStatus>();

function getOrCreateStatus(name: string): EnemyStatus {
    let status = enemyStatusMap.get(name);
    if (!status) {
        status = { paralyzed: false, brokenDefense: false };
        enemyStatusMap.set(name, status);
    }
    return status;
}

function findMatchingEnemy(eventName: string): string | null {
    for (const name of enemyStatusMap.keys()) {
        if (fuzzyMatch(name, eventName, FUZZY_THRESHOLD)) {
            return name;
        }
    }
    return null;
}

export function registerEnemyStatusFilter(client: Client) {
    client.on("enemy.paralyzed", ({ name }) => {
        const existingMatch = findMatchingEnemy(name);
        const targetName = existingMatch || name;
        const status = getOrCreateStatus(targetName);
        status.paralyzed = true;
    });

    client.on("enemy.paralyzed.end", ({ name }) => {
        const existingMatch = findMatchingEnemy(name);
        if (existingMatch) {
            const status = enemyStatusMap.get(existingMatch);
            if (status) {
                status.paralyzed = false;
            }
        }
    });

    client.on("enemy.broken_defense", ({ name }) => {
        const existingMatch = findMatchingEnemy(name);
        const targetName = existingMatch || name;
        const status = getOrCreateStatus(targetName);
        status.brokenDefense = true;
    });

    client.on("parsedObjects", () => {
        enemyStatusMap.clear();
    });

    client.on("enterLocation", () => {
        enemyStatusMap.clear();
    });

    objectListFilters.register("enemy-status", (context, result) => {
        const desc = context.rawDescription;

        for (const [name, status] of enemyStatusMap.entries()) {
            if (fuzzyMatch(desc, name, FUZZY_THRESHOLD)) {
                if (status.paralyzed || status.brokenDefense) {
                    const currentColor = result.style.descriptionColor || "#ffffff";
                    result.style.descriptionBackgroundColor = currentColor;
                    result.style.descriptionColor = "#000000";
                }
                break;
            }
        }
    }, 100);
}
