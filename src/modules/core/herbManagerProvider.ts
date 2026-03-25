import type { HerbManagerApi } from "@client/types/herbs";

let provider: HerbManagerApi | null = null;

export function registerHerbManagerProvider(api: HerbManagerApi): void {
    provider = api;
}

export function getHerbManager(): HerbManagerApi | null {
    return provider;
}
