export interface HerbBagState {
    herbs: Record<string, number>;
    condition?: number;
}

export type HerbBagsState = Record<number, HerbBagState>;

const MIN_CONDITION = 1;
const MAX_CONDITION = 5;

export function clampHerbBagCondition(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_CONDITION;
    }
    return Math.max(MIN_CONDITION, Math.min(MAX_CONDITION, Math.round(value)));
}

export function normalizeHerbBagState(input: unknown): HerbBagState {
    const result: HerbBagState = { herbs: {} };
    if (!input || typeof input !== "object") {
        return result;
    }

    const source = input as Record<string, unknown>;
    const herbsSource =
        typeof source.herbs === "object" && source.herbs
            ? (source.herbs as Record<string, unknown>)
            : source;

    Object.entries(herbsSource).forEach(([key, value]) => {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            result.herbs[key] = value;
        }
    });

    const rawCondition = source.condition;
    if (typeof rawCondition === "number" && Number.isFinite(rawCondition)) {
        result.condition = clampHerbBagCondition(rawCondition);
    }

    return result;
}

export function normalizeHerbBagsState(input: unknown): HerbBagsState {
    const result: HerbBagsState = {};
    if (!input || typeof input !== "object") {
        return result;
    }

    Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
        const bagNumber = Number(key);
        if (!Number.isFinite(bagNumber) || bagNumber <= 0) {
            return;
        }
        result[bagNumber] = normalizeHerbBagState(value);
    });

    return result;
}

export interface HerbMoveOptions {
    herbId: string;
    amount: number;
    fromBag: number;
    toBag: number;
}

export interface HerbGiveItem {
    herbId: string;
    amount: number;
    fromBag?: number;
}

export interface HerbGiveTarget {
    id: number;
    name: string;
    team: boolean;
}

export interface HerbGiveResult {
    targetFound: boolean;
    given: number;
    missing: string[];
}

export interface HerbManagerApi {
    getBags(): HerbBagsState;
    take(herbId: string, amount: number, fromBag?: number): Promise<number>;
    put(herbId: string, amount: number, bag: number): Promise<number>;
    move(options: HerbMoveOptions): Promise<void>;
    getGiveTargets(): HerbGiveTarget[];
    give(target: string | number, items: HerbGiveItem[]): Promise<HerbGiveResult>;
}
