export interface TransportTimerPayload {
    label: string;
    remaining: number | null;
    total: number | null;
}

/**
 * Seconds left on a leg below which the arrival counts as imminent: the footer
 * chip turns red and `transport.approaching` fires. One constant so the trigger
 * fires exactly when the player sees the chip change colour.
 */
export const TRANSPORT_SOON_SECONDS = 10;

/** Payload of the transport trigger events (`transport.stop`, `transport.destination`...). */
export interface TransportStopEventPayload {
    /** Transport name, e.g. "Statek Nuln - Kraina Zgromadzenia". */
    transport: string;
    /** Label of the stop reached (or, for `approaching`, about to be reached). */
    stop: string;
}

export interface TransportApproachingPayload extends TransportStopEventPayload {
    /** Whole seconds left on the leg when the event fired. */
    remaining: number;
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
