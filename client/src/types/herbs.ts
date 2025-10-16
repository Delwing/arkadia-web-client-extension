export type HerbBagsState = Record<number, Record<string, number>>;

export interface HerbMoveOptions {
    herbId: string;
    amount: number;
    fromBag: number;
    toBag: number;
}

export interface HerbManagerApi {
    getBags(): HerbBagsState;
    take(herbId: string, amount: number, fromBag?: number): Promise<number>;
    put(herbId: string, amount: number, bag: number): Promise<number>;
    move(options: HerbMoveOptions): Promise<void>;
}
