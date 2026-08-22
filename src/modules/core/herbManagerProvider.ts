import type { HerbManagerApi } from "@client/types/herbs";

let provider: HerbManagerApi | null = null;

/** Pass null to withdraw the provider — consumers already handle its absence. */
export function registerHerbManagerProvider(api: HerbManagerApi | null): void {
    provider = api;
}

export function getHerbManager(): HerbManagerApi | null {
    return provider;
}
