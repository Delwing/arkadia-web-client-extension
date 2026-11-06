import {getLongDir, isDirection, longToShort} from "@shared/map/directions.ts";
import {characterStorage} from "@modules/core/storage";
import type {MapDataStore} from "./MapDataStore";
import {followExit, resolveDirection, stepTarget} from "./exitResolution";
import {MoveJournal} from "./MoveJournal";
import {PositionLoss} from "./PositionLoss";
import {StepShadow} from "./StepShadow";
import type {GmcpPosition, MapHelperClient, MapStorage} from "./types";

/**
 * Where we stand on the map: the current room and how we got there, kept up to
 * date from our own steps, team follows and the game's GMCP fixes, and how sure
 * the mapper is of it.
 */
export class PositionTracker {
    currentRoom!: MapData.Room;
    readonly locationHistory: number[] = [];
    refreshPosition = true;
    paused = false;
    isBlockable = false;
    /** Aboard a ship or coach: the rooms passed through are its route, not ours. */
    onTransport = false;
    savedRoomId: number | null = null;
    readonly loss: PositionLoss;
    readonly journal = new MoveJournal();
    /** A step queue confirmed by room.info, watched beside the mapper - see {@link StepShadow}. */
    readonly shadow: StepShadow;
    // True when the most recent gmcp.room.info applied a position change that has
    // not yet been reconciled with a follow-step. Lets followMove() avoid moving
    // a second time on top of a position GMCP already advanced this step.
    private gmcpJustMoved = false;
    gmcpPosition!: GmcpPosition;
    private lastMoveDirection: string | null = null;
    private readonly resolve = (direction: string, room: MapData.Room) => this.resolveDirection(direction, room);

    constructor(
        private readonly client: MapHelperClient,
        private readonly data: MapDataStore,
        private readonly storage: MapStorage,
        /** Called after every room drawn as current, whether stepped into or placed in. */
        private readonly onRoomRendered: (id: number) => void,
    ) {
        this.loss = new PositionLoss(client);
        this.shadow = new StepShadow({
            getRoom: id => this.data.reader?.getRoom(id),
            resolve: (direction, room) => this.resolveDirection(direction, room),
            mapRoomId: () => this.currentRoom?.id,
        });
        const saved = this.storage.getItem('mapperRoomId');
        if (saved != null) {
            const parsed = parseInt(String(saved));
            if (!Number.isNaN(parsed)) {
                this.savedRoomId = parsed;
            }
        }
    }

    setBlockable(isBlockable: boolean) {
        this.isBlockable = isBlockable;
    }

    /** `gmcp.room.info`: the game's word on where we stand. */
    handleRoomInfo(eventDetail: any) {
        const gmcpRoom = this.data.resolveGmcpRoom(eventDetail?.map);
        this.shadow.roomInfo(gmcpRoom, () => this.applyRoomInfo(eventDetail));
    }

    private applyRoomInfo(eventDetail: any) {
        this.setBlockable(false);
        this.gmcpPosition = eventDetail?.map;
        // Reset per room.info so a leftover flag from a step without a
        // follow-step can't suppress the next step's relative move.
        this.gmcpJustMoved = false;
        // While lost the position on screen is known to be wrong, so the first
        // room.info that names a room the map knows is taken as the way back,
        // whether or not a refresh was already pending.
        if (this.refreshPosition || this.loss.isLost) {
            const before = this.currentRoom?.id;
            if (this.setMapPosition(this.gmcpPosition)) {
                this.refreshPosition = false;
                if (this.currentRoom?.id !== before) {
                    this.gmcpJustMoved = true;
                }
            }
        }
    }

    /** `refreshPositionWhenAble`: take the GMCP position now, or on the next room.info. */
    refreshWhenAble() {
        if (!this.setMapPosition(this.gmcpPosition)) {
            this.refreshPosition = true;
        }
    }

    /** `gmcp.char.info`: a character is in, so put the map back where they last stood. */
    restoreSavedRoom() {
        const value = characterStorage.get('mapperRoomId');
        if (value != null) {
            const parsed = parseInt(String(value));
            if (!Number.isNaN(parsed)) {
                this.savedRoomId = parsed;
                this.setMapRoomById(this.savedRoomId, {silent: true});
            }
        }
    }

    /** `reset`: forget the GMCP position and ask for a fresh one. */
    reset() {
        this.gmcpPosition = undefined;
        this.client.sendEvent("refreshPositionWhenAble");
    }

    /** `map.setLocation`: placed by someone who knows, perhaps only by a guess. */
    placeFromHandoff(data: { roomId: number; uncertain?: boolean }) {
        this.setMapRoomById(data.roomId);
        // Placing the room clears any doubt, so a guess is marked after it.
        if (data.uncertain) this.loss.set(true, 'handoff');
    }

    parseCommand(command: string): string | null {
        if (command.trim() === "idz") {
            this.refreshPosition = true;
            if (this.currentRoom) {
                const allExits = Object.assign(
                    {},
                    this.currentRoom.exits ?? {},
                    this.currentRoom.specialExits ?? {}
                );
                const exitDirs = Object.keys(allExits);
                if (exitDirs.length === 2 && this.locationHistory.length >= 2) {
                    const prevId = this.locationHistory[this.locationHistory.length - 2];
                    const cameFrom = exitDirs.find(d => allExits[d] === prevId);
                    const alt = exitDirs.find(d => d !== cameFrom);
                    if (alt) {
                        return longToShort[alt] ?? alt;
                    }
                }
            }
        }
        if (this.currentRoom?.userData?.dir_bind) {
            const dirBinds = Object.fromEntries(
                this.currentRoom.userData.dir_bind
                    .split("&")
                    .map((item: string) => item.split("="))
            );
            if (dirBinds[getLongDir(command)]) {
                return dirBinds[getLongDir(command)];
            }
        }
        return command;
    }

    /**
     * What the map believes actually leads `direction` from the current room, without moving.
     * See {@link resolveDirection} in exitResolution.
     *
     * Split out of move() so callers that must not advance the mapper (driving a carriage, where
     * the ride is asynchronous and GMCP is the authority) can still resolve the direction.
     */
    resolveDirection(direction: string, room: MapData.Room | undefined = this.currentRoom): string {
        if (!this.data.reader || this.paused || !room) return direction;
        return resolveDirection(this.data.reader, direction, room);
    }

    /**
     * Put the map in `roomId` and take the journal's steps again from there: the
     * room another device knew we were in, before the steps taken here since,
     * which this device made from a room it only believed we were in.
     *
     * Each step is judged as the mapper judges it live: a move the room has no
     * exit for stays put - the game most likely refused it too - while a follow
     * that leads nowhere means the map has lost us. Marked as lost then, or when
     * the room itself is `uncertain`.
     *
     * False, doing nothing, when there is no journal or the map has been placed
     * since it started.
     */
    replayJournal(roomId: number, uncertain: boolean): boolean {
        const steps = this.journal.replayableSteps;
        if (!steps || !this.data.reader) return false;
        const history = [roomId];
        let lost = uncertain;
        for (const step of steps) {
            if (step.kind === 'back') {
                if (history.length > 1) history.pop();
                continue;
            }
            const room = this.data.reader.getRoom(history[history.length - 1]);
            const exit = room && (step.kind === 'move' ? step.direction : followExit(this.resolve, room, step.direction, step.fullFollow));
            const target = room && exit !== undefined
                ? stepTarget(this.resolve, room, exit, step.kind === 'follow' || step.isTeamFollow)
                : undefined;
            if (target !== undefined) history.push(target);
            else if (step.kind === 'follow') lost = true;
        }
        this.journal.withoutRecording(() => this.setMapRoomById(history[history.length - 1]));
        this.locationHistory.length = 0;
        this.locationHistory.push(...history);
        if (lost) this.loss.set(true, 'handoff');
        return true;
    }

    /** @param record - false for followMove's own step, which it journals as a follow. */
    move(direction: string, isTeamFollow: boolean = false, record = true): { direction: string; moved: boolean; suppress?: boolean } {
        if (!this.data.reader) {
            return {direction, moved: false};
        }
        if (this.paused) {
            return {direction, moved: false};
        }
        let actualDirection = direction;
        if (this.currentRoom) {
            actualDirection = this.resolveDirection(direction);

            if (actualDirection !== direction) {
                if (!isTeamFollow) {
                    this.client.sendCommand(actualDirection);
                }
                return {direction: actualDirection, moved: false, suppress: true};
            }
        }
        const allExits: Record<string, number> = Object.assign(
            {},
            this.currentRoom?.exits ?? {},
            this.currentRoom?.specialExits ?? {}
        );
        const locationId = allExits[getLongDir(actualDirection)];
        // Every command passes through here. A compass direction is a step whether
        // or not the map knows the way, since the room it shows may be the wrong
        // one to take it from; anything else only when it is an exit of that room.
        if (record && (isDirection(actualDirection) || locationId)) {
            this.journal.recordStep({kind: 'move', direction: actualDirection, isTeamFollow});
        }
        if (this.currentRoom) {
            if (locationId) {
                this.locationHistory.push(locationId);
                this.lastMoveDirection = getLongDir(actualDirection);
                this.renderRoomById(locationId, true, {relative: true});
                this.sendMapMove();
                return {direction: actualDirection, moved: true};
            }
        }
        return {direction: actualDirection, moved: false};
    }

    followMove(direction: string, fullFollow?: string) {
        // When the authoritative GMCP room.info for this step already advanced
        // us (it is parsed inline and applied before the buffered prose line that
        // triggers this follow reaches us), a relative follow-step would overshoot.
        // During "idz marszem" every step both updates the GMCP position and
        // prints "Ruszasz marszem na <dir>"; without this guard the two stack and
        // walk us one room too far. We key off whether GMCP actually moved us this
        // step rather than position equality, because across frames the prose can
        // arrive before its room.info, in which case the stale GMCP position would
        // also "match" the current room yet the relative move is still required.
        if (this.gmcpJustMoved) {
            this.gmcpJustMoved = false;
            this.shadow.follow();
            return undefined;
        }

        if (this.data.reader && !this.paused) this.journal.recordStep({kind: 'follow', direction, fullFollow});
        const exit = this.currentRoom ? followExit(this.resolve, this.currentRoom, direction, fullFollow) : undefined;
        if (exit !== undefined) {
            const res = this.move(exit, true, false);
            if (res.moved) {
                this.shadow.follow();
                return res.direction;
            }
        }

        if (!this.isGmcpPositionCurrent()) {
            this.refreshPosition = true;
            this.loss.suspect('follow', () =>
                this.isGmcpPositionCurrent() || this.data.resolveGmcpRoom(this.gmcpPosition) !== undefined);
        }

        this.shadow.follow();
        return undefined;
    }

    private isGmcpPositionCurrent(): boolean {
        if (!this.gmcpPosition || !this.currentRoom) return false;
        return this.data.resolveGmcpRoom(this.gmcpPosition) === this.currentRoom.id;
    }

    refresh() {
        const roomId = this.currentRoom.id;
        if (this.setMapPosition(this.gmcpPosition)) {
            this.refreshPosition = false;
        }
        return roomId === this.currentRoom.id;
    }

    setMapPosition(data: GmcpPosition) {
        if (data && data.x !== undefined && data.y !== undefined && data.name) {
            const room = this.data.resolveGmcpRoom(data);
            if (room === undefined) {
                // The game put us somewhere the map does not know. Blanking the map
                // would only lose the last good room, so the marker stays where it
                // is and the warning says it cannot be trusted.
                if (this.data.ready) {
                    this.loss.set(true, 'gmcp');
                }
                return false;
            }
            this.setMapRoom(room);
            this.refreshPosition = false;
            this.loss.clear();
            return true;
        }
        return false;
    }

    setMapRoomById(id: number, options?: { silent?: boolean; direction?: string | null }) {
        this.journal.recordPlacement();
        this.loss.clear();
        if (this.currentRoom?.id === id) {
            if (!options?.silent) {
                this.client.sendEvent("enterLocation", {
                    id,
                    room: this.currentRoom,
                    direction: options?.direction ?? null
                });
            }
            return;
        }
        this.locationHistory.length = 0;
        this.locationHistory.push(id);
        this.lastMoveDirection = options?.direction ?? null;
        this.renderRoomById(id);
    }

    setMapRoom(room: number, direction?: string | null) {
        this.journal.recordPlacement();
        this.locationHistory.length = 0;
        this.locationHistory.push(room);
        this.lastMoveDirection = direction ?? null;
        this.renderRoomById(room);
        this.sendMapMove();
    }

    moveBack() {
        this.locationHistory.pop();
        if (!this.locationHistory[this.locationHistory.length - 1]) {
            this.client.sendEvent("stepBack");
            return;
        }
        this.journal.recordStep({kind: 'back'});
        this.renderRoomById(this.locationHistory[this.locationHistory.length - 1], true, {relative: true});
        this.client.sendEvent("stepBack");
        this.sendMapMove();
    }

    /** Announce a move, unless the client asked for this one to pass silently. */
    private sendMapMove() {
        if (!this.client.getSuppressMapMoveEvent()) {
            this.client.sendEvent("mapMove");
        } else {
            this.client.setSuppressMapMoveEvent(false);
        }
    }

    renderRoomByIdSilently(id: number) {
        if (typeof id !== "number") {
            return;
        }
        const previousSuppress = this.client.getSuppressMapMoveEvent();
        this.client.setSuppressMapMoveEvent(true);
        try {
            this.renderRoomById(id, false);
        } finally {
            this.client.setSuppressMapMoveEvent(previousSuppress);
        }
    }

    /**
     * @param options.relative - the room was reached by stepping there from the
     * room already on screen, rather than asserted by whoever knows better. Every
     * other caller - /ustaw, the GPS, the labyrinth mappers, a plugin, a GMCP
     * fix - is placing us, so landing anywhere new that way settles any doubt
     * about where we are.
     */
    renderRoomById(id: number, sendEvent = true, options?: { relative?: boolean }) {
        if (!this.data.reader) {
            this.savedRoomId = id;
            return;
        }
        const placed = !options?.relative && id !== this.currentRoom?.id;
        if (placed) {
            this.journal.recordPlacement();
            this.loss.clear();
        }
        this.currentRoom = this.data.reader.getRoom(id);
        if (placed) this.shadow.placed(id);
        this.savedRoomId = id;
        this.storage.setItem('mapperRoomId', id);
        if (sendEvent) {
            const direction = this.lastMoveDirection;
            this.lastMoveDirection = null;
            this.client.sendEvent("enterLocation", {id, room: this.currentRoom, direction});
        }
        this.onRoomRendered(id);
    }
}
