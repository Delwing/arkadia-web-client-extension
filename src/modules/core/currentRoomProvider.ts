let provider: (() => number | null) | null = null;

export function registerCurrentRoomProvider(fn: () => number | null): void {
    provider = fn;
}

export function getCurrentRoomId(): number | null {
    return provider?.() ?? null;
}
