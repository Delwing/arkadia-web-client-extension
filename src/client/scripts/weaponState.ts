import Client from "../Client";
import weaponOnPatterns from "./weapon_on_patterns.json";
import weaponOffPatterns from "./weapon_off_patterns.json";

interface PatternEntry {
    pattern: string;
    type: number;
}

interface TriggerEntry {
    name: string;
    script: string;
    patterns: PatternEntry[];
    parents?: {
        name: string;
        patterns: PatternEntry[];
    }[];
}

// Pattern types from Mudlet:
// 0 = substring (matches anywhere)
// 1 = regex
// 2 = startOfLine (substring at start)
// 3 = exactMatch (entire line must match)

function patternToTrigger(entry: PatternEntry): string | RegExp {
    const { pattern, type } = entry;
    switch (type) {
        case 0: // substring
            return pattern;
        case 1: // regex
            return new RegExp(pattern);
        case 2: // startOfLine
            return new RegExp(`^${escapeRegExp(pattern)}`);
        case 3: // exactMatch
            return new RegExp(`^${escapeRegExp(pattern)}$`);
        default:
            return pattern;
    }
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function initWeaponState(client: Client) {
    const tag = 'weapon-state';

    function setWeaponOn() {
        client.sendEvent('weapon_state', true);
        return undefined;
    }

    function setWeaponOff() {
        client.sendEvent('weapon_state', false);
        return undefined;
    }

    // Register weapon ON triggers
    for (const entry of weaponOnPatterns as TriggerEntry[]) {
        const patterns = entry.patterns.map(patternToTrigger);

        if (entry.parents && entry.parents.length > 0) {
            // Nested trigger - register parent first, then child
            const parent = entry.parents[0];
            const parentPatterns = parent.patterns.map(patternToTrigger);
            const parentTrigger = client.Triggers.registerTrigger(parentPatterns, undefined, tag);
            parentTrigger.registerChild(patterns, setWeaponOn, tag);
        } else {
            // Standalone trigger
            client.Triggers.registerTrigger(patterns, setWeaponOn, tag);
        }
    }

    // Register weapon OFF triggers
    for (const entry of weaponOffPatterns as TriggerEntry[]) {
        const patterns = entry.patterns.map(patternToTrigger);

        if (entry.parents && entry.parents.length > 0) {
            const parent = entry.parents[0];
            const parentPatterns = parent.patterns.map(patternToTrigger);
            const parentTrigger = client.Triggers.registerTrigger(parentPatterns, undefined, tag);
            parentTrigger.registerChild(patterns, setWeaponOff, tag);
        } else {
            client.Triggers.registerTrigger(patterns, setWeaponOff, tag);
        }
    }

    // Handle weapon knocked off events
    client.on('weaponKnockedOff', setWeaponOff);
    client.on('weaponKnockedOffNekroTilea', setWeaponOff);

    // Reset state on disconnect
    client.on('client.disconnect', () => {
        client.sendEvent('weapon_state', false);
    });
}
