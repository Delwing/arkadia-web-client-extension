import type Client from "../Client";
import { parseItems } from "./prettyContainers";
import loadHerbs, { subscribeToHerbs, type HerbsData } from "./herbsLoader";
import { polishWordToNumber } from "./polishNumberConverter";
import { characterStorage } from "@modules/core/storage";
import { waitForLine } from "../utils/waitForLine";

/**
 * Herb names and bag listings, shared by the herb counter and the plugin API
 * (`api.herbs.resolve`, `form`, `inspectBag`).
 */

/** Herb count a bag listing's "wiele" stands for, unless the player set another */
export const DEFAULT_HERB_WIELE_COUNT = 25;

/** "Rozwiazujesz na chwile rzemyk..." / "Uwaznie ogladasz zawartosc..." with the herbs in `content` */
export const HERB_BAG_CONTENT_PATTERNS: readonly RegExp[] = [
    /^Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego.*woreczka.* W srodku dostrzegasz (?<content>.*)\.$/,
    /^[> ]*Uwaznie ogladasz zawartosc[a-zA-Z -]*woreczka[a-z ]*\. W srodku dostrzegasz (?<content>[a-zA-Z0-9, -]+)\.$/,
];

/** The same two listings for an empty bag */
export const HERB_BAG_EMPTY_PATTERNS: readonly RegExp[] = [
    /^Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego.*woreczka.* W jego srodku nic jednak nie ma\.$/,
    /^[> ]*Uwaznie ogladasz zawartosc[a-zA-Z -]*woreczka[a-z ]*\. W jego srodku nic jednak nie ma\.$/,
];

/** The game's answer when there is nothing by that name to look into */
const NOTHING_TO_INSPECT = /^Zajrzyj do czego\?$/;

const biernikDigits = new Set([2, 3, 4]);

/**
 * The form of a herb that follows a count in a command: "wez 1 <biernik>",
 * "wez 3 <mnoga_biernik>", "wez 5 <mnoga_dopelniacz>". Unknown herbs keep their id.
 */
export function herbFormForCount(herbId: string, amount: number, herbsData?: HerbsData | null): string {
    const forms = herbsData?.herb_id_to_odmiana[herbId];
    if (!forms) return herbId;
    const num = Number(amount);
    if (num < 22) {
        if (num === 1) {
            return forms.biernik;
        }
        if (biernikDigits.has(num)) {
            return forms.mnoga_biernik;
        }
        return forms.mnoga_dopelniacz;
    }
    if (num % 10 > 1 && num % 10 < 5) {
        return forms.mnoga_biernik;
    }
    return forms.mnoga_dopelniacz;
}

const formMaps = new WeakMap<HerbsData, Record<string, string>>();

/** Every case form of every herb (lowercase) to its herb id */
export function herbFormMap(herbsData: HerbsData): Record<string, string> {
    let map = formMaps.get(herbsData);
    if (!map) {
        map = {};
        for (const [id, forms] of Object.entries(herbsData.herb_id_to_odmiana)) {
            for (const form of Object.values(forms)) {
                map[form.toLowerCase()] = id;
            }
        }
        formMaps.set(herbsData, map);
    }
    return map;
}

/**
 * Herb id for a description as the game prints it, in any case form and with
 * or without a count: "zolty jasny kwiat", "dwa zolte jasne kwiaty". Null when
 * it is not a herb.
 */
export function resolveHerbName(text: string, herbsData: HerbsData): string | null {
    const map = herbFormMap(herbsData);
    const plain = text.trim().toLowerCase().replace(/\.$/, '');
    if (map[plain]) return map[plain];
    const items = parseItems(plain);
    return items.length === 1 ? map[items[0].name.toLowerCase()] ?? null : null;
}

/**
 * Herbs in a bag listing's content, by herb id. A name that is not a known
 * herb is kept under its own lowercase name.
 */
export function parseHerbBagContent(content: string, herbsData: HerbsData | null, wieleCount: number): Record<string, number> {
    const map = herbsData ? herbFormMap(herbsData) : {};
    const herbs: Record<string, number> = {};
    for (const item of parseItems(content)) {
        const key = map[item.name.toLowerCase()] || item.name.toLowerCase();
        let count: number;
        if (typeof item.count === 'number') {
            count = item.count;
        } else if (item.count === 'wie') {
            count = wieleCount;
        } else {
            count = polishWordToNumber(String(item.count));
        }
        herbs[key] = (herbs[key] || 0) + count;
    }
    return herbs;
}

/** The player's "wiele" count from the herb settings */
export function herbWieleCount(): number {
    const value = (characterStorage.get('settings') as { herbWieleCount?: number } | undefined)?.herbWieleCount;
    return typeof value === 'number' && value > 0 ? value : DEFAULT_HERB_WIELE_COUNT;
}

let cachedData: HerbsData | null = null;
let loadingData: Promise<HerbsData | null> | null = null;
let subscribed = false;

/** Herb data, loaded once and kept current */
export async function getHerbsData(): Promise<HerbsData | null> {
    if (!subscribed) {
        subscribed = true;
        subscribeToHerbs((data) => { if (data) cachedData = data; });
    }
    if (cachedData) return cachedData;
    loadingData ??= loadHerbs().then((data) => {
        cachedData = data ?? cachedData;
        return cachedData;
    }).finally(() => { loadingData = null; });
    return loadingData;
}

export interface HerbBagInspection {
    /** Herbs by id; names that are not known herbs are under their own name */
    herbs: Record<string, number>;
    /** All herbs in the bag ("wiele" counted as the player's setting) */
    total: number;
    empty: boolean;
    /** Names in the bag that are not known herbs */
    unknown: string[];
}

/**
 * Looks into one herb bag (`zajrzyj do <target>`, e.g. "swojego woreczka",
 * "2. swojego woreczka") and resolves with what is in it. Null when there is no
 * such bag or no listing arrives within the timeout (5 s by default).
 */
export async function inspectHerbBag(
    client: Client,
    target: string,
    options: { timeout?: number; signal?: AbortSignal } = {},
): Promise<HerbBagInspection | null> {
    const herbsData = await getHerbsData();
    const listing = waitForLine(
        client.Triggers,
        [...HERB_BAG_CONTENT_PATTERNS, ...HERB_BAG_EMPTY_PATTERNS, NOTHING_TO_INSPECT],
        { timeout: options.timeout ?? 5000, signal: options.signal },
    );
    client.sendCommand(`zajrzyj do ${target}`);
    let result;
    try {
        result = await listing;
    } catch (error) {
        if ((error as Error)?.name === 'TimeoutError') return null;
        throw error;
    }
    if (result.index >= HERB_BAG_CONTENT_PATTERNS.length + HERB_BAG_EMPTY_PATTERNS.length) return null;
    if (result.index >= HERB_BAG_CONTENT_PATTERNS.length) {
        return { herbs: {}, total: 0, empty: true, unknown: [] };
    }
    const herbs = parseHerbBagContent(result.match.groups?.content ?? '', herbsData, herbWieleCount());
    const known = herbsData?.herb_id_to_odmiana ?? {};
    const total = Object.values(herbs).reduce((sum, n) => sum + n, 0);
    return { herbs, total, empty: total === 0, unknown: Object.keys(herbs).filter(key => !known[key]) };
}
