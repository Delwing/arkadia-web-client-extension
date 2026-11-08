import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import type {ShadowReport} from "@client/map/StepShadow.ts";
import {getMapSettings, onMapSettingsChange} from "@modules/core/settings";

/**
 * `/mapkolejka`: prints what the shadow step queue (see StepShadow) makes of the
 * steps, looks, blockers and room.info, so it can be watched in play before the
 * mapper relies on it. Off by default and for each session.
 *
 * - `/mapkolejka` - on (only refusals and disagreements with the map) / off
 * - `/mapkolejka wszystko` - every event, including each confirmed step
 * - `/mapkolejka stan` - what is waiting now
 *
 * The map setting `mapShadowMarker` (off by default) also marks the room the queue
 * believes we are in.
 */

const ALIAS = '/mapkolejka';
const TAG = 'step-shadow';
const GREY = createColorFormat('#9e9e9e');
const ORANGE = createColorFormat('#ffa500');
const RED = createColorFormat('#ff5f5f');
const GREEN = createColorFormat('#7fff00');
/** Unlike the player marker and the route, so it reads as something else. */
export const SHADOW_MARKER_COLOR = '#ff3df5';

type Mode = 'off' | 'problems' | 'all';

const LABEL: Record<ShadowReport['type'], string> = {
    queued: 'wyslany',
    confirmed: 'potwierdzony',
    look: 'rozejrzenie',
    rejected: 'odrzucony',
    unexpected: 'room.info bez kroku',
    'unmatched-reject': 'odmowa bez kroku',
    reset: 'od nowa',
};

/** Whether a report is worth a line when only problems are shown. */
export function isProblem(report: ShadowReport): boolean {
    switch (report.type) {
        case 'rejected':
        case 'unmatched-reject':
            return true;
        case 'confirmed':
        case 'look':
            return report.diverged || report.gmcpDisagrees === true || (report.skipped?.length ?? 0) > 0;
        case 'reset':
            return report.source === 'stale';
        default:
            // A room.info nothing waited for is a follow, a ride or a script; the reset after it says the rest.
            return false;
    }
}

export default function initStepShadowReport(client: Client) {
    let mode: Mode = 'off';
    let unsubscribe: (() => void) | undefined;

    const room = (id: number | undefined) => {
        if (id === undefined) return '?';
        const name = client.Map.getRoomById(id)?.name;
        return name ? `#${id} ${name}` : `#${id}`;
    };

    const describe = (report: ShadowReport): AnsiAwareBuffer => {
        const color = report.type === 'rejected' || report.diverged || report.gmcpDisagrees || report.skipped?.length ? RED
            : report.type === 'confirmed' || report.type === 'look' ? GREEN
                : ORANGE;
        const line = colorString('[kolejka] ', GREY);
        line.appendBuffer(colorString(LABEL[report.type], color));
        const entry = report.entry;
        if (entry?.kind === 'step') line.append(` ${entry.direction}`);
        if (entry?.kind === 'look') line.append(' (spojrz)');
        if (report.source) line.append(` [${report.source}]`);
        line.append(` | kolejka: ${room(report.shadowRoom)}`);
        line.append(` | mapa: ${room(report.mapRoom)}`);
        if (report.gmcpRoom !== undefined) line.append(` | gmcp: ${room(report.gmcpRoom)}`);
        line.append(` | czeka: ${report.pending}`);
        if (report.diverged) line.appendBuffer(colorString(' ROZJAZD', RED));
        if (report.gmcpDisagrees) line.appendBuffer(colorString(' GMCP INACZEJ', RED));
        if (report.skipped?.length) {
            // Refused by a line the shadow does not know yet - worth finding out which.
            const what = report.skipped.map(e => e.kind === 'step' ? e.direction : 'spojrz').join(', ');
            line.appendBuffer(colorString(` POMINIETE: ${what}`, RED));
        }
        return line;
    };

    const marker = client.Map.createHighlighter({color: SHADOW_MARKER_COLOR, enabled: false});
    let markerRoom: number | undefined;
    const placeMarker = (roomId: number | undefined) => {
        if (roomId === markerRoom) return;
        if (markerRoom !== undefined) marker.remove(markerRoom);
        markerRoom = roomId;
        if (roomId !== undefined) marker.add(roomId);
    };

    const onReport = (report: ShadowReport) => {
        if (marker.isEnabled()) placeMarker(report.shadowRoom);
        if (mode === 'all' || (mode === 'problems' && isProblem(report))) client.println(describe(report));
    };

    /** The shadow only builds reports while someone listens: the printout, the marker, or both. */
    const syncListener = () => {
        const wanted = mode !== 'off' || marker.isEnabled();
        if (wanted) unsubscribe ??= client.Map.stepShadow.onReport(onReport);
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
        syncListener();
    };
    applyMarkerSetting(getMapSettings().mapShadowMarker);
    onMapSettingsChange(settings => applyMarkerSetting(settings.mapShadowMarker));

    const setMode = (next: Mode) => {
        mode = next;
        syncListener();
        const label = mode === 'off' ? 'wylaczona' : mode === 'all' ? 'wlaczona (wszystko)' : 'wlaczona (tylko problemy)';
        client.println(colorString(`Kolejka krokow mapy: ${label}.`, GREY));
    };

    // Refusals the mapper itself only acts on in some areas: the shadow hears them everywhere.
    client.Triggers.registerTrigger(/^[ >]*Nie widzisz zadnego wyjscia prowadzacego na (.+)\.$/, (line) => {
        client.Map.stepShadow.reject('brak wyjscia');
        return line;
    }, TAG);
    client.Triggers.registerTrigger(/^[ >]*Nie mozesz sie tam udac, gdyz ktos lapie cie/, (line) => {
        client.Map.stepShadow.reject('ktos lapie');
        return line;
    }, TAG);

    client.aliases.push({
        pattern: new RegExp(`^${ALIAS}(?: (wszystko|stan))?$`),
        callback: (matches: RegExpMatchArray) => {
            const arg = matches[1];
            if (arg === 'stan') {
                const shadow = client.Map.stepShadow;
                const waiting = shadow.pending
                    .map(entry => entry.kind === 'step' ? entry.direction : 'spojrz')
                    .join(', ') || 'nic';
                client.println(colorString(
                    `Kolejka: potwierdzone ${room(shadow.confirmedRoom)}, czeka: ${waiting}, `
                    + `wychodzi ${room(shadow.shadowRoom)}, mapa ${room(client.Map.currentRoom?.id)}.`,
                    GREY,
                ));
                return;
            }
            if (arg === 'wszystko') {
                setMode(mode === 'all' ? 'off' : 'all');
                return;
            }
            setMode(mode === 'off' ? 'problems' : 'off');
        },
    });
}
