type DestinationsLookup = () => number[];

let provider: DestinationsLookup | null = null;

export function registerMapDestinationsProvider(fn: DestinationsLookup): void {
    provider = fn;
}

export function getMapDestinations(): number[] {
    return provider?.() ?? [];
}
