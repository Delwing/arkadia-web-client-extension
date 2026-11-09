import Client from "../Client";
import type {ShadowReport} from "@client/map/StepShadow.ts";
import {getMapSettings, onMapSettingsChange} from "@modules/core/settings";

/**
 * What the step queue (see StepShadow) is allowed to do, driven by two settings on
 * the "Eksperymentalne" page, both off by default:
 * - `mapShadowMarker` marks the room the queue believes we are in;
 * - `mapStepQueueCorrection` moves the map there whenever the game has just answered
 *   (a step confirmed, a look, a refusal) and the queue and the map disagree.
 *
 * The queue itself always runs; it also hears here the refusals the mapper only acts
 * on in some areas.
 */

const TAG = 'step-queue';
/** Unlike the player marker and the route, so it reads as something else. */
export const SHADOW_MARKER_COLOR = '#ff3df5';

/**
 * Events after which the game has just had its say. A disagreement then is the map's
 * mistake. Not a room.info nothing waited for: a team follow arrives that way, and its
 * prose moves the map a moment later - correcting first would walk it a room too far.
 */
const CORRECTED_AFTER = new Set<ShadowReport['type']>(['confirmed', 'look', 'rejected']);

export default function initStepQueue(client: Client) {
    let unsubscribe: (() => void) | undefined;
    let correcting = false;

    const marker = client.Map.createHighlighter({color: SHADOW_MARKER_COLOR, enabled: false});
    let markerRoom: number | undefined;
    const placeMarker = (roomId: number | undefined) => {
        if (roomId === markerRoom) return;
        if (markerRoom !== undefined) marker.remove(markerRoom);
        markerRoom = roomId;
        if (roomId !== undefined) marker.add(roomId);
    };

    /** Put the map where the queue says we are, without the queue taking it as a placement. */
    const correct = (report: ShadowReport) => {
        const target = report.shadowRoom;
        if (!correcting || !CORRECTED_AFTER.has(report.type) || !report.diverged || target === undefined) return;
        client.Map.stepShadow.inStepWithMap(() => client.Map.setMapRoomById(target));
    };

    const onReport = (report: ShadowReport) => {
        correct(report);
        if (marker.isEnabled()) placeMarker(report.shadowRoom);
    };

    /** The queue only builds reports while someone listens: the marker, the correction or both. */
    const syncListener = () => {
        if (marker.isEnabled() || correcting) unsubscribe ??= client.Map.stepShadow.onReport(onReport);
        else {
            unsubscribe?.();
            unsubscribe = undefined;
        }
    };

    const applyMarkerSetting = (on: boolean) => {
        if (on === marker.isEnabled()) return;
        if (on) {
            placeMarker(client.Map.stepShadow.shadowRoom);
            marker.enable();
        } else {
            marker.disable();
            placeMarker(undefined);
        }
    };
    const applySettings = (settings: {mapShadowMarker: boolean; mapStepQueueCorrection: boolean}) => {
        applyMarkerSetting(settings.mapShadowMarker);
        correcting = settings.mapStepQueueCorrection;
        syncListener();
    };
    applySettings(getMapSettings());
    onMapSettingsChange(applySettings);

    // Refusals the mapper itself only acts on in some areas: the queue hears them everywhere.
    client.Triggers.registerTrigger(/^[ >]*Nie widzisz zadnego wyjscia prowadzacego na (.+)\.$/, (line) => {
        client.Map.stepShadow.reject('brak wyjscia');
        return line;
    }, TAG);
    client.Triggers.registerTrigger(/^[ >]*Nie mozesz sie tam udac, gdyz ktos lapie cie/, (line) => {
        client.Map.stepShadow.reject('ktos lapie');
        return line;
    }, TAG);
}
