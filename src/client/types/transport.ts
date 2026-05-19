export interface TransportTimerPayload {
    label: string;
    remaining: number | null;
    total: number | null;
}

export interface TransportRouteStop {
    label: string;
    durationSeconds: number | null;
}

export interface TransportRoutePayload {
    transportName: string;
    originLabel: string;
    stops: TransportRouteStop[];
    activeStopIndex: number | undefined;
    onBoard: boolean;
    loop: boolean;
}

export interface TransportDebugState {
    kind: string;
    def?: string;
    next?: string;
    leg?: string;
    locationId: number | null;
    pendingDefs?: string;
}

export interface TransportLegDebug {
    fromId: number;
    toId: number;
    fromLabel: string;
    toLabel: string;
    /** Time currently used by the timer (override if recorded, otherwise JSON default). */
    currentTime: number | null;
    /** Original time declared in the transport JSON. */
    originalTime: number | null;
    /** Shortest recorded duration from IndexedDB (the active override). */
    shortest: number | null;
    /** Longest recorded duration from IndexedDB. */
    longest: number | null;
    /** Last expected duration value recorded alongside the segment. */
    expectedDuration: number | null;
    /** Timestamp of the last recording (ms). */
    updatedAt: number | null;
}

export interface TransportTimesDebugEntry {
    name: string;
    legs: TransportLegDebug[];
}

export interface TransportTimesDebugPayload {
    transports: TransportTimesDebugEntry[];
}

export interface TransportLegResetPayload {
    transport: string;
    fromId: number;
    toId: number;
}
