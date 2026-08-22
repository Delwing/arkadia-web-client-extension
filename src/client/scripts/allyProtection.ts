import Client from "../Client";
import type {ObjectData} from "../ObjectManager";
import {refresh as refreshPeopleStore, subscribeMerged} from '@modules/data/peopleLoader';
import type {PersonListEntry} from '../types/people';
import {colorString, createColorFormat} from "@modules/core/Colors";
import {characterStorage} from "@modules/core/storage";
import {defaultSettings} from "@modules/core/defaultSettings";

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
    }

    const applySettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as { allyGuilds?: unknown };
        if (Array.isArray(detail.allyGuilds)) {
            allyGuilds = [...detail.allyGuilds];
        } else {
            allyGuilds = [];
        }
        rebuildAllySet();
        ensurePeopleLoaded().catch(() => undefined);
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', (settings) => {
        applySettings(settings);
    });

    // Listen to object data and cache ally status on first encounter
    client.on('gmcp.objects.data', (data) => {
        if (!data || allyDescriptions.size === 0) return;

        for (const [numStr, obj] of Object.entries(data as unknown as Record<string, ObjectData>)) {
            const num = Number(numStr);
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
    let pendingAttack: { id: number; timestamp: number } | null = null;
    const CONFIRM_TIMEOUT_MS = 5000; // 5 seconds to confirm

    // Check on-demand if not in cache (fallback for race conditions)
    function checkAndCacheObject(objectNum: number): boolean {
        if (allyCache.has(objectNum)) {
            return allyCache.get(objectNum)!.isAlly;
        }

        // Not cached - check now
        if (allyDescriptions.size === 0) {
            return false;
        }

        const objects = client.ObjectManager.getObjectsOnLocation();
        const obj = objects.find(o => o.num === objectNum);
        if (!obj?.desc) {
            return false;
        }

        const lowerName = obj.desc.toLowerCase();
        const isInSet = allyDescriptions.has(lowerName);
        if (isInSet) {
            const ally = peopleCache.find(p =>
                !p.ignored &&
                isProperName(p.name) &&
                p.name.toLowerCase() === lowerName &&
                (allyGuilds.includes(p.guild) || p.isAlly === true)
            );
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

    function setPendingAttack(id: number) {
        pendingAttack = { id, timestamp: Date.now() };
    }

    function checkPendingAttack(id: number): boolean {
        if (!pendingAttack) return false;
        const isMatch = pendingAttack.id === id &&
            (Date.now() - pendingAttack.timestamp) < CONFIRM_TIMEOUT_MS;
        if (isMatch) {
            pendingAttack = null; // Clear after confirmation
        }
        return isMatch;
    }

    // --- the gate -----------------------------------------------------------
    //
    // Every attack funnels through sendCommand, so one command hook covers every
    // path: the attack bind, the enemy binds, /zabij-style aliases, plugins and a
    // command the player simply types. The command shape comes from the "Komenda
    // ataku" setting (client.attackCommand), read per call so a settings change
    // takes effect immediately.

    /** Cheap prefix test data, refreshed only when the setting changes. */
    let prefix = '';
    let prefixLen = 0;
    let prefixHead = -1;

    function refreshPrefix() {
        prefix = `${client.attackCommand.trim().toLowerCase()} `;
        prefixLen = prefix.length;
        prefixHead = prefix.charCodeAt(0);
    }

    refreshPrefix();
    characterStorage.onChange('settings', refreshPrefix);

    /** `ob_5` directly, or `@shortcut` — hooks run before shortcuts are expanded. */
    function resolveTarget(rest: string): number | null {
        const direct = rest.match(/^ob_(\d+)$/i);
        if (direct) return Number(direct[1]);

        const short = rest.match(/^@([A-Za-z0-9@]+)$/);
        if (!short) return null;
        const wanted = short[1].toLowerCase();
        const obj = client.ObjectManager.getObjectsOnLocation()
            .find(o => o.shortcut?.toLowerCase() === wanted);
        return obj ? obj.num : null;
    }

    /** The object this command attacks, or null if it is not an attack at all. */
    function attackTargetId(command: string): number | null {
        // Ordered cheapest-first: this runs on every outgoing command.
        // The shortest possible target is a two-character shortcut like `@a`.
        if (command.length < prefixLen + 2) return null;
        const head = command.charCodeAt(0);
        if (head !== prefixHead && head !== prefixHead - 32) return null;
        if (command.slice(0, prefixLen).toLowerCase() !== prefix) return null;
        return resolveTarget(command.slice(prefixLen).trim());
    }

    client.registerCommandHook('allyProtection', (command, _echo, options) => {
        if (allyDescriptions.size === 0) return undefined;   // nothing to protect

        const id = attackTargetId(command);
        if (id === null || !isAlly(id)) return undefined;

        // Bulk attacks skip allies quietly rather than prompting per target.
        if (options?.suppressPrompts) return null;

        if (checkPendingAttack(id)) return undefined;        // repeat within 5s confirms

        const info = getAllyInfo(id);
        showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
        setPendingAttack(id);
        return null;
    });

    return { isAlly, getAllyInfo };
}

export type AllyProtection = ReturnType<typeof initAllyProtection>;
