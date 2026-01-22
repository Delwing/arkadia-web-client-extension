import Client from "@client/Client";
import {objectListFilters} from "../objectListFilters";
import {fuzzyMatchScore} from "@client/utils/fuzzyMatch";

const MIN_FUZZY_THRESHOLD = 0.7;
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

function calculateWordListScore(a: string, b: string): number {
    const aWords = a.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const bWords = b.toLowerCase().split(/\s+/).filter(w => w.length > 0);

    if (aWords.length === 0 || bWords.length === 0) return 0;

    const [shorter, longer] = aWords.length <= bWords.length
        ? [aWords, bWords]
        : [bWords, aWords];

    let totalScore = 0;
    for (const word of shorter) {
        const bestMatch = Math.max(...longer.map(other => fuzzyMatchScore(word, other)));
        totalScore += bestMatch;
    }

    return totalScore / shorter.length;
}

function findMatchingEnemy(eventName: string): string | null {
    let bestMatch: string | null = null;
    let bestScore = MIN_FUZZY_THRESHOLD;

    for (const name of enemyStatusMap.keys()) {
        const score = calculateWordListScore(name, eventName);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = name;
        }
    }

    return bestMatch;
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

        let bestMatch: EnemyStatus | null = null;
        let bestScore = MIN_FUZZY_THRESHOLD;

        for (const [name, status] of enemyStatusMap.entries()) {
            const score = calculateWordListScore(desc, name);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = status;
            }
        }

        if (bestMatch && (bestMatch.paralyzed || bestMatch.brokenDefense)) {
            result.style.descriptionBackgroundColor = result.style.descriptionColor || "#ffffff";
            result.style.descriptionColor = "#000000";
        }
    }, 100);
}
