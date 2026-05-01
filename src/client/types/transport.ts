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
