import type {LeadPlanner} from "./LeadPlanner";
import type {MapDrawData} from "./MapDrawData";
import type {PositionTracker} from "./PositionTracker";
import type {RoomBinds} from "./RoomBinds";
import type {MapHelperClient} from "./types";

export interface MapEventTargets {
    position: PositionTracker;
    binds: RoomBinds;
    lead: LeadPlanner;
    drawData: MapDrawData;
}

/**
 * Subscribe the mapper to the client events that drive it - GMCP, placements,
 * lead requests, and the UI asking for draw data again - and ask for a first
 * position fix. Handlers on the same event run in the order registered here.
 */
export function bindMapEvents(client: MapHelperClient, {position, binds, lead, drawData}: MapEventTargets): void {
    client.on("enterLocation", detail => binds.handleNewLocation(detail as { room: any }));
    client.on("stepBack", () => binds.abortPending());
    client.on("transport.onBoard", (v: boolean) => { position.onTransport = v; });

    client.on("renderMapLocation", (ev: { locationId: number }) => {
        position.renderRoomByIdSilently(ev.locationId);
    });

    client.on("leadToByInternalId", (internalId: string) => lead.leadToInternalId(internalId));

    client.on("gmcp.room.info", (eventDetail) => position.handleRoomInfo(eventDetail));
    client.on("refreshPositionWhenAble", () => position.refreshWhenAble());
    client.on("gmcp.char.info", () => position.restoreSavedRoom());
    client.on("reset", () => position.reset());
    client.on("map.setLocation", (data: { roomId: number; uncertain?: boolean }) => position.placeFromHandoff(data));

    client.on("leadTo", (target: number) => {
        lead.leadTo(target);
    });

    client.on("leadToWithTransport", (request: { roomId: number; aggressive?: boolean }) => {
        lead.leadTo(request.roomId, { transport: true, aggressive: request.aggressive === true });
    });

    client.on("switchLeadMode", (request: { transport: boolean; aggressive?: boolean }) => {
        lead.switchLeadMode(request.transport, request.aggressive === true);
    });

    // Mounting or leaving a carriage changes which rooms are passable, as does marking one, so
    // a route already on screen has to be worked out again.
    client.on("carriageModeChanged", () => lead.releadForChangedRules());
    client.on("carriageBlocks.changed", () => lead.releadForChangedRules());
    client.on("enterLocation", () => lead.followAlongRoute());

    client.on("clearLeadTo", () => {
        lead.clearLeadTo();
    });

    client.on("tripPlanner.leadTo", (targets: number[]) => {
        lead.setMultiDestinations(targets);
    });

    client.on("highlights", (highlights: number[]) => {
        drawData.setHighlights(highlights);
    });

    client.on("requestMapLocationLabel", () => {
        drawData.emitLocationLabel();
    });

    client.on("requestMapHighlights", () => {
        drawData.emitHighlights();
    });

    client.on("requestMapPath", () => {
        drawData.emitPath();
    });

    client.on("requestMapPositionLost", () => {
        position.loss.emit();
    });

    client.sendEvent("refreshPositionWhenAble");
}
