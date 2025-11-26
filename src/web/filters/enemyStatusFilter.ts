import Client from "@client/Client";
import {objectListFilters} from "../objectListFilters";
import {fuzzyMatch} from "@client/utils/fuzzyMatch";

const FUZZY_THRESHOLD = 0.6;
const PARALYZED_TIMEOUT_MS = 15000;
const BROKEN_DEFENSE_TIMEOUT_MS = 3000;

type EnemyStatus = {
    paralyzed: boolean;
    brokenDefense: boolean;
    paralyzedTimer: ReturnType<typeof setTimeout> | null;
    brokenDefenseTimer: ReturnType<typeof setTimeout> | null;
};

const enemyStatusMap = new Map<string, EnemyStatus>();

function getOrCreateStatus(name: string): EnemyStatus {
    let status = enemyStatusMap.get(name);
    if (!status) {
        status = { paralyzed: false, brokenDefense: false, paralyzedTimer: null, brokenDefenseTimer: null };
        enemyStatusMap.set(name, status);
    }
    return status;
}

function clearParalyzedTimer(status: EnemyStatus) {
    if (status.paralyzedTimer) {
        clearTimeout(status.paralyzedTimer);
        status.paralyzedTimer = null;
    }
}

function clearBrokenDefenseTimer(status: EnemyStatus) {
    if (status.brokenDefenseTimer) {
        clearTimeout(status.brokenDefenseTimer);
        status.brokenDefenseTimer = null;
    }
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
    const startParalyzedTimer = (status: EnemyStatus) => {
        clearParalyzedTimer(status);
        status.paralyzedTimer = setTimeout(() => {
            status.paralyzed = false;
            status.paralyzedTimer = null;
            client.sendEvent("enemy.paralyzed.end", { name: "" });
        }, PARALYZED_TIMEOUT_MS);
    };

    client.on("enemy.paralyzed", ({ name }) => {
        const existingMatch = findMatchingEnemy(name);
        const targetName = existingMatch || name;
        const status = getOrCreateStatus(targetName);
        status.paralyzed = true;
        startParalyzedTimer(status);
    });

    client.on("enemy.paralyzed.end", ({ name }) => {
        const existingMatch = findMatchingEnemy(name);
        if (existingMatch) {
            const status = enemyStatusMap.get(existingMatch);
            if (status) {
                status.paralyzed = false;
                clearParalyzedTimer(status);
            }
        }
    });

    client.on("enemy.broken_defense", ({ name }) => {
        const existingMatch = findMatchingEnemy(name);
        const targetName = existingMatch || name;
        const status = getOrCreateStatus(targetName);
        status.brokenDefense = true;
        clearBrokenDefenseTimer(status);
        status.brokenDefenseTimer = setTimeout(() => {
            status.brokenDefense = false;
            status.brokenDefenseTimer = null;
            client.sendEvent("enemy.broken_defense", { name: "" });
        }, BROKEN_DEFENSE_TIMEOUT_MS);
    });

    objectListFilters.register("enemy-status", (context, result) => {
        const desc = context.rawDescription;

        for (const [name, status] of enemyStatusMap.entries()) {
            if (fuzzyMatch(desc, name, FUZZY_THRESHOLD)) {
                if (status.paralyzed || status.brokenDefense) {
                    result.style.descriptionBackgroundColor = result.style.descriptionColor || "#ffffff";
                    result.style.descriptionColor = "#000000";
                }
                break;
            }
        }
    }, 100);
}
