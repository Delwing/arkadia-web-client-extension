import Client from "@client/Client";
import {objectListFilters} from "../objectListFilters";
import {fuzzyMatchScore} from "@client/utils/fuzzyMatch";

const MIN_FUZZY_THRESHOLD = 0.7;
const MIN_BEST_MATCH_THRESHOLD = 0.5;
const PARALYZED_TIMEOUT_MS = 15000;
const BROKEN_DEFENSE_TIMEOUT_MS = 3000;

type EnemyStatus = {
    paralyzed: boolean;
    brokenDefense: boolean;
    paralyzedTimer: ReturnType<typeof setTimeout> | null;
    brokenDefenseTimer: ReturnType<typeof setTimeout> | null;
    bestMatchObjectNum: number | null;
    bestMatchScore: number;
};

const enemyStatusMap = new Map<string, EnemyStatus>();

function getOrCreateStatus(name: string): EnemyStatus {
    let status = enemyStatusMap.get(name);
    if (!status) {
        status = { paralyzed: false, brokenDefense: false, paralyzedTimer: null, brokenDefenseTimer: null, bestMatchObjectNum: null, bestMatchScore: 0 };
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

function resetBestMatches() {
    for (const status of enemyStatusMap.values()) {
        status.bestMatchObjectNum = null;
        status.bestMatchScore = 0;
    }
}

function updateBestMatches(objects: Map<number, { desc?: string }>) {
    resetBestMatches();

    for (const [num, obj] of objects.entries()) {
        const desc = obj.desc;
        if (!desc) continue;

        for (const [name, status] of enemyStatusMap.entries()) {
            if (!status.paralyzed && !status.brokenDefense) continue;

            const score = calculateWordListScore(desc, name);
            if (score > MIN_BEST_MATCH_THRESHOLD && score > status.bestMatchScore) {
                status.bestMatchScore = score;
                status.bestMatchObjectNum = num;
            }
        }
    }
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

    const triggerBestMatchUpdate = () => {
        const locationObjects = client.ObjectManager.getObjectsOnLocation();
        const objectsMap = new Map<number, { desc?: string }>();
        for (const obj of locationObjects) {
            if (obj.num != null) {
                objectsMap.set(obj.num, { desc: obj.desc });
            }
        }
        updateBestMatches(objectsMap);
    };

    client.on("enemy.paralyzed", ({ name }) => {
        const existingMatch = findMatchingEnemy(name);
        const targetName = existingMatch || name;
        const status = getOrCreateStatus(targetName);
        status.paralyzed = true;
        startParalyzedTimer(status);
        triggerBestMatchUpdate();
    });

    client.on("enemy.paralyzed.end", ({ name }) => {
        const existingMatch = findMatchingEnemy(name);
        if (existingMatch) {
            const status = enemyStatusMap.get(existingMatch);
            if (status) {
                status.paralyzed = false;
                clearParalyzedTimer(status);
            }
            return;
        }

        // Fallback: match by GMCP object description (stun-end name in nominative = object desc)
        if (!name) return;
        const lowerName = name.toLowerCase();
        const objects = client.ObjectManager.getObjectsOnLocation();
        const matchingObj = objects.find(o => o.desc?.toLowerCase() === lowerName);
        if (!matchingObj) return;

        for (const status of enemyStatusMap.values()) {
            if (status.paralyzed && status.bestMatchObjectNum === matchingObj.num) {
                status.paralyzed = false;
                clearParalyzedTimer(status);
                return;
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
        triggerBestMatchUpdate();
    });

    client.on("enemyKilled", ({ objNum }) => {
        for (const [name, status] of enemyStatusMap.entries()) {
            if (status.bestMatchObjectNum === objNum) {
                status.paralyzed = false;
                status.brokenDefense = false;
                clearParalyzedTimer(status);
                clearBrokenDefenseTimer(status);
                enemyStatusMap.delete(name);
            }
        }
    });

    client.on("parsedObjects", triggerBestMatchUpdate);

    objectListFilters.register("enemy-status", (context, result) => {
        const objectNum = context.object.num;

        for (const status of enemyStatusMap.values()) {
            if ((status.paralyzed || status.brokenDefense) && status.bestMatchObjectNum === objectNum) {
                result.style.descriptionBackgroundColor = result.style.descriptionColor || "#ffffff";
                result.style.descriptionColor = "#000000";
                return;
            }
        }
    }, 100);
}
