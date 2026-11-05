import type {TransportDef} from "@client/scripts/transports/definitions";
import {describeCarriageRoute} from "./carriagePathFinder";
import {exitCommandTo} from "./exitResolution";
import type {MapDataStore} from "./MapDataStore";
import {SEGMENT_COLORS} from "./segmentColors";
import {planRoute, type RouteSegment} from "./transportPathFinder";
import type {LeadOptions, MapHelperClient, TransportRoute} from "./types";

/**
 * Leading somewhere: /prowadz, /prowadzt and the trip planner's stops. Owns the
 * destinations and the planned route drawn on the map, and replans that route
 * as we travel along it or as the rules of the road change.
 */
export class LeadPlanner {
    destinations: number[] = [];
    transportRoute: TransportRoute | null = null;
    /** Where we are currently leading to, so the route can be redrawn when the rules change. */
    leadTarget: number | null = null;
    /** How that lead was asked for, so redrawing it keeps riding what it was riding. */
    leadOptions: LeadOptions = {};
    /** True while the drawn route came from the carriage router rather than the plain pathfinder. */
    private carriageLead = false;
    /** Transfer point already announced, so travelling along the route does not repeat itself. */
    private announcedTransfer: number | null = null;

    constructor(
        private readonly client: MapHelperClient,
        private readonly data: MapDataStore,
        private readonly position: { readonly currentRoom: MapData.Room; readonly onTransport: boolean },
        private readonly carriageBlocks: (() => ReadonlySet<number> | null) | undefined,
        private readonly transportDefs: (() => TransportDef[]) | undefined,
        /** Redraw the path, highlights and location label. */
        private readonly emitDrawData: () => void,
    ) {
    }

    /**
     * Lead to a room, by whatever combination of walking, driving and riding gets there.
     *
     * The plain pathfinder handles the ordinary case on its own; the shared planner takes over as
     * soon as a wagon or a transport is in play, including when walking cannot get there at all
     * and a ship or a coach is the only answer.
     */
    leadTo(id: number, options: LeadOptions = {}) {
        const currentId = this.position.currentRoom?.id;
        if (currentId === id) {
            this.client.sendEvent("notify", { text: 'Jesteś już na miejscu', source: 'map', key: 'map.lead' });
            return;
        }
        if (this.leadTarget !== id) this.announcedTransfer = null;
        this.leadTarget = id;
        this.leadOptions = options;

        const blocked = this.carriageBlocks?.() ?? null;
        if (!blocked && !options.transport) {
            const path = this.data.pathFinder?.findPath(currentId, id);
            if (path && path.length > 1) {
                this.clearCarriageRouteStep();
                this.destinations = [id];
                this.transportRoute = null;
                this.emitDrawData();
                return;
            }
        }

        if (typeof currentId !== 'number' || !this.data.reader) {
            this.client.sendEvent("notify", { text: 'Brak ścieżki do lokacji', level: 'warning', source: 'map', key: 'map.lead' });
            return;
        }

        const defs = this.transportDefs?.() ?? [];
        const plan = (withTransport: boolean) => planRoute(this.data.reader, currentId, id, {
            defs: withTransport ? defs : undefined,
            carriageBlocked: blocked,
            // Aggressive routing all but ignores the cost of changing vehicles, keeping the
            // walking down at the price of more transfers.
            boardingPenalty: options.aggressive ? 10 : undefined,
            timeToHopRatio: options.aggressive ? 0.1 : undefined,
        });

        const wantsTransport = options.transport === true;
        // With neither a wagon nor a transport in play the plain pathfinder has already had its
        // say, and a walking-only plan would only repeat it.
        let segments = wantsTransport || blocked ? plan(wantsTransport) : null;
        // Nowhere to walk or drive is exactly when a boat or a coach is the answer, so try one
        // rather than making the user ask again with /prowadzt.
        const viaFallback = !wantsTransport && (!segments || segments.length === 0);
        if (viaFallback) segments = plan(true);

        if (!segments || segments.length === 0) {
            this.client.sendEvent("notify", { text: 'Brak ścieżki do lokacji', level: 'warning', source: 'map', key: 'map.lead' });
            return;
        }
        this.drawRoute(segments, currentId, id, { ...options, viaFallback }, blocked);
    }

    /** `leadToByInternalId`: lead to the room that advertises `internalId`. */
    leadToInternalId(internalId: string) {
        if (!internalId) return;
        const roomId = this.data.internalIds[internalId];
        if (roomId != null) {
            this.leadTo(roomId);
        }
    }

    /**
     * Put a planned route on the map, and say whatever needs saying about it: which way to drive,
     * where to leave the wagon, which ship to board.
     */
    private drawRoute(
        segments: RouteSegment[],
        fromId: number,
        toId: number,
        options: LeadOptions & { viaFallback?: boolean },
        blocked: ReadonlySet<number> | null,
    ) {
        const walkSegments: TransportRoute["walkSegments"] = [];
        const hops: TransportRoute["hops"] = [];
        let colorIndex = 0;
        for (const segment of segments) {
            const color = SEGMENT_COLORS[colorIndex++ % SEGMENT_COLORS.length];
            if (segment.kind === 'transport') {
                hops.push({
                    fromRoomId: segment.fromRoomId,
                    toRoomId: segment.toRoomId,
                    transportName: segment.transportName,
                    label: segment.label,
                    color,
                });
            } else {
                walkSegments.push({ path: segment.rooms, color });
            }
        }

        // A route with no wagon in it must take down any step the last one was offering.
        if (blocked) this.carriageLead = true;
        else this.clearCarriageRouteStep();
        this.setTransportRoute({ walkSegments, hops, finalDestination: toId });

        if (blocked) this.announceCarriageLeg(segments, fromId, toId, blocked);
        // Riding somewhere is a set of instructions, not just a line on the map, so it has to be
        // spelled out - but only when it is news. A route is replanned on every step of the
        // journey, and repeating the whole itinerary each room would be noise.
        if (options.announce !== false && segments.some(segment => segment.kind === 'transport')) {
            this.client.sendEvent("routePlanned", {
                segments,
                viaFallback: options.viaFallback === true,
                aggressive: options.aggressive === true,
                driving: blocked !== null,
            });
        }
    }

    /** Offer the next step of the drive, and say where the wagon has to be left when it does. */
    private announceCarriageLeg(
        segments: RouteSegment[],
        fromId: number,
        toId: number,
        blocked: ReadonlySet<number>,
    ) {
        const route = describeCarriageRoute(segments, fromId, toId, blocked);
        this.client.sendEvent("carriageRouteStep", {
            nextCommand: route.drive.length > 1 ? exitCommandTo(this.position.currentRoom, route.drive[1]) : null,
            atTransfer: route.leftToTravel && route.transfer === fromId,
        });
        // Only worth saying when the wagon has to be left somewhere, and only when that somewhere
        // is news - the route is redrawn on every step, and repeating it each room would be noise.
        if (route.leftToTravel && route.transfer !== this.announcedTransfer) {
            this.announcedTransfer = route.transfer;
            this.client.sendEvent("carriageRoute", {
                transfer: route.transfer,
                driveRooms: route.driveRooms,
                walkRooms: route.walkRooms,
                destinationBlocked: route.destinationBlocked,
                boarding: route.boarding,
            });
        }
    }

    /**
     * Lead on to where we are already leading, by the other rules: turn a /prowadz into a
     * /prowadzt or back, without having to name the target again.
     */
    switchLeadMode(transport: boolean, aggressive = false) {
        const target = this.leadTarget;
        // The trip planner draws its stops without a lead target, and a target already reached
        // is forgotten - either way there is nothing to switch.
        if (target === null || !this.destinations.includes(target)) {
            this.client.sendEvent("notify", { text: 'Nie prowadzisz nigdzie', source: 'map', key: 'map.lead' });
            return;
        }
        this.leadTo(target, transport ? { transport: true, aggressive } : {});
    }

    setMultiDestinations(ids: number[]) {
        this.destinations = ids;
        this.transportRoute = null;
        this.emitDrawData();
    }

    clearLeadTo() {
        this.leadTarget = null;
        this.leadOptions = {};
        this.clearCarriageRouteStep();
        this.announcedTransfer = null;
        this.destinations = [];
        this.transportRoute = null;
        this.emitDrawData();
    }

    /** Stop offering a step: leading has ended, or is no longer a carriage matter. */
    private clearCarriageRouteStep() {
        if (this.carriageLead) {
            this.client.sendEvent("carriageRouteStep", {nextCommand: null, atTransfer: false});
        }
        this.carriageLead = false;
    }

    /**
     * The command for the next step along the route on screen, or null when there is none to take.
     *
     * Follows whatever is drawn: a route planned with ships and coaches (/prowadzt) or around a
     * wagon's barred rooms, rather than the plain walking path, which may go somewhere else
     * entirely. Standing where a ride is boarded there is nothing to walk, so null.
     */
    nextLeadCommand(): string | null {
        const room = this.position.currentRoom;
        const currentId = room?.id;
        if (typeof currentId !== 'number') return null;
        if (this.transportRoute) {
            for (const segment of this.transportRoute.walkSegments) {
                const index = segment.path.indexOf(currentId);
                if (index > -1 && index < segment.path.length - 1) {
                    return exitCommandTo(room, segment.path[index + 1]);
                }
            }
            return null;
        }
        const target = this.destinations[0];
        if (target === undefined) return null;
        const path = this.data.pathFinder?.findPath(currentId, target);
        if (!path || path.length < 2) return null;
        return exitCommandTo(room, path[1]);
    }

    /** `enterLocation`: a planned route follows us along it, but not while riding something. */
    followAlongRoute() {
        // An ordinary lead is recomputed from the current room every time it is drawn, but a
        // planned route - by wagon, by ship - is stored as fixed segments, so without this it
        // stays frozen where the journey began instead of following us along it. Not while
        // actually aboard something, though: the rooms a vehicle passes through are its route, not
        // ours, and replanning from them would throw away the ride we are in the middle of.
        if (this.position.onTransport) return;
        if (this.carriageLead || this.transportRoute) this.releadForChangedRules();
    }

    /**
     * Redraw the route we are leading along, because what counts as passable has changed.
     *
     * Getting on or off a carriage changes the rules mid-journey: a route worked out on foot may
     * run through rooms a wagon cannot enter, and one worked out for a wagon takes detours that are
     * pointless once you are walking.
     */
    releadForChangedRules() {
        const target = this.leadTarget;
        if (target === null) return;
        if (target === this.position.currentRoom?.id) {
            // Arrived. An ordinary lead is taken down by removeReachedDestination, but a planned
            // route lives in the transport segments as well, so without this the finished route
            // would stay drawn.
            if (this.carriageLead || this.transportRoute) this.clearLeadTo();
            return;
        }
        this.leadTo(target, { ...this.leadOptions, announce: false });
    }

    setTransportRoute(route: TransportRoute & { finalDestination?: number }) {
        this.transportRoute = { walkSegments: route.walkSegments, hops: route.hops };
        this.destinations = typeof route.finalDestination === "number" ? [route.finalDestination] : [];
        this.emitDrawData();
    }

    clearTransportRoute() {
        this.transportRoute = null;
        this.emitDrawData();
    }

    removeReachedDestination(roomId: number) {
        // Arriving ends the journey, so stop remembering where it was going. Otherwise the next
        // thing that redraws a route - mounting a carriage, marking a room barred - would lead us
        // back to a destination we have already stood in.
        if (roomId === this.leadTarget) this.leadTarget = null;
        const index = this.destinations.indexOf(roomId);
        if (index > -1) {
            this.destinations.splice(index, 1);
        }
    }
}
