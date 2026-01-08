import Client from "../Client";
import type { ObjectData } from "../ObjectManager";
import { subscribeMerged, refresh as refreshPeopleStore } from '@modules/data/peopleLoader';
import type { PersonListEntry } from '../types/people';
import { colorString, createColorFormat } from "@modules/core/Colors";

const ALLY_WARNING_COLOR = createColorFormat("#ffff00");

export default function initAllyProtection(client: Client) {
    let allyGuilds: string[] = [];
    let peopleCache: PersonListEntry[] = [];
    // Set of lowercase descriptions for O(1) lookup when caching
    let allyDescriptions: Set<string> = new Set();
    // Cache: objectNum -> {isAlly, allyName, allyGuild} - checked once on first encounter
    const allyCache: Map<number, { isAlly: boolean; name?: string; guild?: string }> = new Map();

    subscribeMerged(snapshot => {
        peopleCache = snapshot ?? [];
        rebuildAllySet();
    });

    function ensurePeopleLoaded() {
        return refreshPeopleStore().catch(error => {
            console.warn('Failed to load people database for ally protection', error);
            return undefined;
        });
    }

    ensurePeopleLoaded().catch(() => undefined);

    // Check if name is a proper player name (single capitalized word)
    function isProperName(name: string): boolean {
        // Must be single word (no spaces) and start with uppercase
        return name.length > 0 &&
            !name.includes(' ') &&
            name[0] === name[0].toUpperCase() &&
            name[0] !== name[0].toLowerCase();
    }

    function rebuildAllySet() {
        const newSet = new Set<string>();
        for (const person of peopleCache) {
            if (person.ignored) continue;
            if (!isProperName(person.name)) continue;

            // Include if: in ally guild OR individually marked as ally
            const inAllyGuild = allyGuilds.length > 0 && allyGuilds.includes(person.guild);
            const individualAlly = person.isAlly === true;

            if (inAllyGuild || individualAlly) {
                // Add lowercase name for case-insensitive matching (obj.desc is the player name)
                newSet.add(person.name.toLowerCase());
            }
        }
        allyDescriptions = newSet;
        // Clear cache when ally set changes - will be rebuilt on next encounter
        allyCache.clear();
        console.log(`[AllyProtection] Rebuilt ally set: ${allyDescriptions.size} names, allyGuilds: ${JSON.stringify(allyGuilds)}, peopleCache: ${peopleCache.length}`);
    }

    client.on('settings', (settings) => {
        const detail = (settings ?? {}) as { allyGuilds?: unknown };
        if (Array.isArray(detail.allyGuilds)) {
            allyGuilds = [...detail.allyGuilds];
        } else {
            allyGuilds = [];
        }
        rebuildAllySet();
        ensurePeopleLoaded().catch(() => undefined);
    });

    // Listen to object data and cache ally status on first encounter
    client.on('gmcp.objects.data', (data) => {
        if (!data || allyDescriptions.size === 0) return;

        for (const [num, obj] of data.entries() as IterableIterator<[number, ObjectData]>) {
            if (obj.desc && !allyCache.has(num)) {
                const lowerName = obj.desc.toLowerCase();
                // First time seeing this object - check and cache
                if (allyDescriptions.has(lowerName)) {
                    // Find the ally info for the warning message
                    const ally = peopleCache.find(p =>
                        !p.ignored &&
                        isProperName(p.name) &&
                        p.name.toLowerCase() === lowerName &&
                        (allyGuilds.includes(p.guild) || p.isAlly === true)
                    );
                    allyCache.set(num, { isAlly: true, name: ally?.name, guild: ally?.guild });
                } else {
                    allyCache.set(num, { isAlly: false });
                }
            }
        }
    });

    // Clear cache when leaving location
    client.on('gmcp.room.info', () => {
        allyCache.clear();
        pendingAttack = null;
    });

    // Pending attack for confirmation
    let pendingAttack: { id: number; command?: string; timestamp: number } | null = null;
    const CONFIRM_TIMEOUT_MS = 5000; // 5 seconds to confirm

    // Check on-demand if not in cache (fallback for race conditions)
    function checkAndCacheObject(objectNum: number): boolean {
        if (allyCache.has(objectNum)) {
            const cached = allyCache.get(objectNum)!.isAlly;
            console.log(`[AllyProtection] Cache hit for ${objectNum}: isAlly=${cached}`);
            return cached;
        }

        // Not cached - check now
        console.log(`[AllyProtection] Cache miss for ${objectNum}, checking... allyDescriptions.size=${allyDescriptions.size}`);
        if (allyDescriptions.size === 0) {
            console.log(`[AllyProtection] No ally descriptions, returning false`);
            return false;
        }

        const objects = client.ObjectManager.getObjectsOnLocation();
        const obj = objects.find(o => o.num === objectNum);
        console.log(`[AllyProtection] Object ${objectNum} desc: "${obj?.desc}"`);
        if (!obj?.desc) {
            return false;
        }

        const lowerName = obj.desc.toLowerCase();
        const isInSet = allyDescriptions.has(lowerName);
        console.log(`[AllyProtection] Checking "${lowerName}" in set: ${isInSet}`);
        if (isInSet) {
            const ally = peopleCache.find(p =>
                !p.ignored &&
                isProperName(p.name) &&
                p.name.toLowerCase() === lowerName &&
                (allyGuilds.includes(p.guild) || p.isAlly === true)
            );
            console.log(`[AllyProtection] Found ally: ${ally?.name} (${ally?.guild})`);
            allyCache.set(objectNum, { isAlly: true, name: ally?.name, guild: ally?.guild });
            return true;
        } else {
            allyCache.set(objectNum, { isAlly: false });
            return false;
        }
    }

    function isAlly(objectNum: number): boolean {
        return checkAndCacheObject(objectNum);
    }

    function getAllyInfo(objectNum: number): { name?: string; guild?: string } | undefined {
        if (checkAndCacheObject(objectNum)) {
            const cached = allyCache.get(objectNum);
            return { name: cached?.name, guild: cached?.guild };
        }
        return undefined;
    }

    function showAllyWarning(allyName: string, allyGuild: string) {
        client.print(colorString(`[UWAGA] Probujesz zaatakowac sojusznika: ${allyName} (${allyGuild})! Powtorz komende aby potwierdzic.`, ALLY_WARNING_COLOR));
    }

    function setPendingAttack(id: number, command?: string) {
        pendingAttack = { id, command, timestamp: Date.now() };
    }

    function checkPendingAttack(id: number, command?: string): boolean {
        if (!pendingAttack) return false;
        // Check if same target, same command, and within timeout
        const isMatch = pendingAttack.id === id &&
            pendingAttack.command === command &&
            (Date.now() - pendingAttack.timestamp) < CONFIRM_TIMEOUT_MS;
        if (isMatch) {
            pendingAttack = null; // Clear after confirmation
        }
        return isMatch;
    }

    return {
        isAlly,
        getAllyInfo,
        showAllyWarning,
        setPendingAttack,
        checkPendingAttack,
    };
}

export type AllyProtection = ReturnType<typeof initAllyProtection>;
