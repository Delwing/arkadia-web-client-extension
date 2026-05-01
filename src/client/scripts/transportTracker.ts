import Client from "../Client";
import { isType } from "../Triggers";
import type { TransportTimerPayload, TransportRoutePayload, TransportRouteStop } from "../types/transport";
import { gmcp } from "../gmcp";
import { getAllTransportSegments, recordTransportSegment } from "../utils/transportStats";
import type { TransportDebugState } from "../types/transport";

import Ancelmus from "./ships/Ancelmus.json";
import Annibale from "./ships/Annibale.json";
import Asa from "./ships/Asa.json";
import Batista from "./ships/Batista.json";
import Bjorn from "./ships/Bjorn.json";
import Cern from "./ships/Cern.json";
import Charonda from "./ships/Charonda.json";
import Creyard from "./ships/Creyard.json";
import Daniel from "./ships/Daniel.json";
import Elich from "./ships/Elich.json";
import Flavius from "./ships/Flavius.json";
import Francois from "./ships/Francois.json";
import Gervais from "./ships/Gervais.json";
import Gmeath from "./ships/Gmeath.json";
import Gvidon from "./ships/Gvidon.json";
import Hallgerda from "./ships/Hallgerda.json";
import Haming from "./ships/Haming.json";
import Jacob from "./ships/Jacob.json";
import Kelim from "./ships/Kelim.json";
import Louis from "./ships/Louis.json";
import Luiggi from "./ships/Luiggi.json";
import Malacius from "./ships/Malacius.json";
import Mallcolm from "./ships/Mallcolm.json";
import Olaf from "./ships/Olaf.json";
import Pluskolec from "./ships/Pluskolec.json";
import Rygwit from "./ships/Rygwit.json";
import Strag from "./ships/Strag.json";
import BialyMostHagge from "./other/Bialy Most - Hagge.json";
import CarrerasRiviaScala from "./other/Carreras - Rivia - Scala.json";
import Jouinard from "./other/Jouinard - Nuln.json";
import KrainaZgromadzenia from "./other/Kraina Zgromadzenia - Nuln.json";
import MariborGrabowa from "./other/Maribor - Grabowa Buchta.json";
import PodgrodzieTretogoruGelibol from "./other/Podgrodzie Tretogoru - Gelibol.json";
import MariborObawa from "./other/Maribor - Obawa.json";
import Salignac from "./other/Salignac - Nuln.json";
import NulnBlekitnaWstega from "./other/Nuln - Blekitna Wstega.json";
import Varieno from "./other/Varieno - Miragliano - Campogrotta.json";
import NovigradOxenfurt from "./other/Novigrad - Oxenfurt.json";
import WyzimaOxenfurt from "./other/Wyzima - Oxenfurt.json";
import QuenellesMontlacMerceauxDesclouxParravon from "./other/Quenelles - Montlac - Merceaux-Descloux - Parravon.json";
import UrbimoToscania from "./other/Urbimo - Toscania.json";

// ── definition types (unchanged from previous system) ────────────────────────

interface RawTransportStop {
    start: number;
    destination: number;
    time?: number;
    stop_pattern?: string;
    set_pattern?: string;
    label?: string;
}

interface RawTransportDefinition {
    enter?: string;
    exit?: string;
    start?: string;
    stop_pattern?: string;
    bind?: string;
    exit_command?: string;
    show_path?: boolean;
    board_commands?: string[];
    standing_patterns?: string[];
    stops: RawTransportStop[];
}

interface CompiledStop extends RawTransportStop {
    stopRegex?: RegExp;
    setRegex?: RegExp;
    patternKey: string;
}

interface Def extends RawTransportDefinition {
    name: string;
    enterPattern?: RegExp;
    exitPattern?: RegExp;
    startPattern?: RegExp;
    stops: CompiledStop[];
    exitCommand?: string;
    locationLabels: Map<number, string>;
    stopGroups: Map<string, number[]>;
    setGroups: Map<string, number[]>;
}

// ── state machine ─────────────────────────────────────────────────────────────

interface Leg {
    stopIdx: number;
    startedAt: number;
}

type State =
    | { kind: 'idle' }
    | { kind: 'pending'; defs: Map<Def, number[]> }
    | { kind: 'on_board'; def: Def; next: Set<number>; leg?: Leg; departed?: boolean }
    | { kind: 'exiting'; def: Def; next: Set<number> };

// ── constants ─────────────────────────────────────────────────────────────────

const BOARD_COMMANDS = new Set([
    "wsiadz na statek", "wejdz na statek", "wejdz na prom", "wsiadz na prom",
    "wsiadz do dylizansu", "wsiadz do wozu", "wsiadz do powozu", "wjedz na statek",
]);
const EXIT_FAILURE_RE = /^Wolisz nie probowac wysiasc z jadacego .*\.$/;
const ABORT_RE = /^Jednym susem przesadzasz burte .* i wskakujesz do wody\. Po chwili udaje ci sie doplynac z powrotem do brzegu\.$/;
const FOLLOW_EXIT_RE = /[pP]odazasz za .* na zewnatrz\.$/;
const EXIT_TIMEOUT_MS = 30_000;
const LOG = "[Transport]";

// ── definition loading (same logic as before) ─────────────────────────────────

const RAW: Array<[string, RawTransportDefinition]> = [
    ["Ancelmus", Ancelmus as RawTransportDefinition], ["Annibale", Annibale as RawTransportDefinition],
    ["Asa", Asa as RawTransportDefinition], ["Batista", Batista as RawTransportDefinition],
    ["Bjorn", Bjorn as RawTransportDefinition], ["Cern", Cern as RawTransportDefinition],
    ["Charonda", Charonda as RawTransportDefinition], ["Creyard", Creyard as RawTransportDefinition],
    ["Daniel", Daniel as RawTransportDefinition], ["Elich", Elich as RawTransportDefinition],
    ["Flavius", Flavius as RawTransportDefinition], ["Francois", Francois as RawTransportDefinition],
    ["Gervais", Gervais as RawTransportDefinition], ["Gmeath", Gmeath as RawTransportDefinition],
    ["Gvidon", Gvidon as RawTransportDefinition], ["Hallgerda", Hallgerda as RawTransportDefinition],
    ["Haming", Haming as RawTransportDefinition], ["Jacob", Jacob as RawTransportDefinition],
    ["Kelim", Kelim as RawTransportDefinition], ["Louis", Louis as RawTransportDefinition],
    ["Luiggi", Luiggi as RawTransportDefinition], ["Malacius", Malacius as RawTransportDefinition],
    ["Mallcolm", Mallcolm as RawTransportDefinition], ["Olaf", Olaf as RawTransportDefinition],
    ["Pluskolec", Pluskolec as RawTransportDefinition], ["Rygwit", Rygwit as RawTransportDefinition],
    ["Strag", Strag as RawTransportDefinition],
    ["Bialy Most - Hagge", BialyMostHagge as RawTransportDefinition],
    ["Carreras - Rivia - Scala", CarrerasRiviaScala as RawTransportDefinition],
    ["Jouinard - Nuln", Jouinard as RawTransportDefinition],
    ["Kraina Zgromadzenia - Nuln", KrainaZgromadzenia as RawTransportDefinition],
    ["Maribor - Grabowa Buchta", MariborGrabowa as RawTransportDefinition],
    ["Podgrodzie Tretogoru - Gelibol", PodgrodzieTretogoruGelibol as RawTransportDefinition],
    ["Maribor - Obawa", MariborObawa as RawTransportDefinition],
    ["Salignac - Nuln", Salignac as RawTransportDefinition],
    ["Nuln - Blekitna Wstega", NulnBlekitnaWstega as RawTransportDefinition],
    ["Varieno - Miragliano - Campogrotta", Varieno as RawTransportDefinition],
    ["Novigrad - Oxenfurt", NovigradOxenfurt as RawTransportDefinition],
    ["Wyzima - Oxenfurt", WyzimaOxenfurt as RawTransportDefinition],
    ["Quenelles - Montlac - Merceaux-Descloux - Parravon", QuenellesMontlacMerceauxDesclouxParravon as RawTransportDefinition],
    ["Urbimo - Toscania", UrbimoToscania as RawTransportDefinition],
];

function compile(name: string, raw: RawTransportDefinition): Def {
    const locationLabels = new Map<number, string>();
    for (const s of raw.stops) {
        const label = (s.label ?? "").trim();
        locationLabels.set(s.destination, label || String(s.destination));
    }
    for (const s of raw.stops) {
        if (!locationLabels.has(s.start)) locationLabels.set(s.start, String(s.start));
    }

    const stops: CompiledStop[] = raw.stops.map(s => {
        const pat = s.stop_pattern ?? raw.stop_pattern;
        return {
            ...s,
            label: (s.label ?? "").trim() || undefined,
            stopRegex: pat ? new RegExp(pat) : undefined,
            setRegex: s.set_pattern ? new RegExp(s.set_pattern) : undefined,
            patternKey: pat ?? "",
        };
    });

    const stopGroups = new Map<string, number[]>();
    const setGroups = new Map<string, number[]>();
    stops.forEach((s, i) => {
        if (s.patternKey) {
            (stopGroups.get(s.patternKey) ?? stopGroups.set(s.patternKey, []).get(s.patternKey)!).push(i);
        }
        if (s.set_pattern) {
            (setGroups.get(s.set_pattern) ?? setGroups.set(s.set_pattern, []).get(s.set_pattern)!).push(i);
        }
    });

    return {
        ...raw, name, stops, locationLabels, stopGroups, setGroups,
        enterPattern: raw.enter ? new RegExp(raw.enter) : undefined,
        exitPattern: raw.exit ? new RegExp(raw.exit) : undefined,
        startPattern: raw.start ? new RegExp(raw.start) : undefined,
        exitCommand: raw.exit_command?.toLowerCase(),
    };
}

// ── labels ────────────────────────────────────────────────────────────────────

function stopLabel(def: Def, idx: number): string {
    const s = def.stops[idx];
    if (!s) return String(idx);
    const dest = (s.label ?? "").trim() || def.locationLabels.get(s.destination) || String(s.destination);
    const from = def.locationLabels.get(s.start) || String(s.start);
    return from === dest ? dest : `${from} → ${dest}`;
}

function destLabel(def: Def, idx: number): string {
    const s = def.stops[idx];
    if (!s) return String(idx);
    return (s.label ?? "").trim() || def.locationLabels.get(s.destination) || String(s.destination);
}

function segKey(def: Def, idx: number): string {
    const s = def.stops[idx];
    return `${def.name}::${s.start}->${s.destination}`;
}

// ── tracker ───────────────────────────────────────────────────────────────────

class Tracker {
    private state: State = { kind: 'idle' };
    private exitTimeout?: ReturnType<typeof setTimeout>;
    private legTimer?: ReturnType<typeof setInterval>;
    private locationId: number | null = null;
    private prevLocationId: number | null = null;
    private durationOverrides = new Map<string, number>();
    // Departure direction seen at a stop before boarding (set_pattern fires while outside)
    private stagedSet = new Map<Def, number>();
    private readonly defs: Def[];
    private readonly exitCmds: Set<string>;

    constructor(private readonly client: Client) {
        this.defs = RAW.map(([name, raw]) => compile(name, raw));
        this.exitCmds = new Set(this.defs.map(d => d.exitCommand).filter((c): c is string => !!c));
        this.registerTriggers();
        void this.loadOverrides();
        this.emit();
        this.emitDebug();
    }

    // ── state transitions ─────────────────────────────────────────────────────

    private go(next: State): void {
        this.clearLegTimer();
        if (this.exitTimeout) {
            clearTimeout(this.exitTimeout);
            this.exitTimeout = undefined;
        }
        this.state = next;
        this.emit();
        this.emitDebug();
    }

    private emitDebug(): void {
        const s = this.state;
        let debug: TransportDebugState | null = null;
        if (s.kind === 'idle') {
            debug = { kind: 'idle', locationId: this.locationId };
        } else if (s.kind === 'pending') {
            debug = {
                kind: 'pending',
                locationId: this.locationId,
                pendingDefs: [...s.defs.entries()].map(([d, idxs]) => `${d.name}[${idxs.join(',')}]`).join(' | '),
            };
        } else if (s.kind === 'on_board') {
            debug = {
                kind: s.leg ? 'traveling' : 'at_stop',
                def: s.def.name,
                next: [...s.next].map(i => `${i}:${destLabel(s.def, i)}`).join(', '),
                leg: s.leg ? `stop ${s.leg.stopIdx} (${stopLabel(s.def, s.leg.stopIdx)}) +${((Date.now() - s.leg.startedAt) / 1000).toFixed(1)}s` : undefined,
                locationId: this.locationId,
            };
        } else if (s.kind === 'exiting') {
            debug = {
                kind: 'exiting',
                def: s.def.name,
                next: [...s.next].map(i => `${i}:${destLabel(s.def, i)}`).join(', '),
                locationId: this.locationId,
            };
        }
        this.client.sendEvent('transportDebug', debug);
    }

    private goIdle(): void {
        this.stagedSet.clear();
        this.go({ kind: 'idle' });
    }

    // ── event handlers (called by triggers) ───────────────────────────────────

    private onBoardCommand(locationId: number): void {
        const found = new Map<Def, number[]>();
        for (const def of this.defs) {
            const idxs = def.stops.map((s, i) => s.start === locationId ? i : -1).filter(i => i >= 0);
            if (idxs.length === 0) continue;
            // Narrow to staged direction if we already saw the departure announcement
            const staged = this.stagedSet.get(def);
            const effective = (staged !== undefined && idxs.includes(staged)) ? [staged] : idxs;
            found.set(def, effective);
        }
        if (found.size === 0) return;

        if (this.state.kind === 'on_board' && found.has(this.state.def)) {
            // Re-boarding same transport
            const nextIdxs = found.get(this.state.def)!;
            this.go({ kind: 'on_board', def: this.state.def, next: new Set(nextIdxs) });
        } else if (this.state.kind === 'exiting' && found.has(this.state.def)) {
            // Re-boarding after exiting
            const nextIdxs = found.get(this.state.def)!;
            this.go({ kind: 'on_board', def: this.state.def, next: new Set(nextIdxs) });
        } else if (this.state.kind === 'pending') {
            // Already pending — intersect with existing candidates so repeated board commands
            // cannot widen a previously-narrowed set
            const merged = new Map<Def, number[]>();
            for (const [def, idxs] of found) {
                const existing = this.state.defs.get(def);
                const intersected = existing ? idxs.filter(i => existing.includes(i)) : idxs;
                merged.set(def, intersected.length > 0 ? intersected : idxs);
            }
            this.go({ kind: 'pending', defs: merged });
        } else {
            this.go({ kind: 'pending', defs: found });
        }

        console.log(`${LOG} Board command at ${locationId}, candidates: ${[...found.keys()].map(d => d.name).join(', ')}`);
    }

    private onEnter(def: Def): void {
        if (this.state.kind === 'pending' && this.state.defs.has(def)) {
            const nextIdxs = this.state.defs.get(def)!;
            this.stagedSet.clear();
            this.go({ kind: 'on_board', def, next: new Set(nextIdxs) });
            // All candidates start at the same location (boarding stop), so any of them
            // gives the correct arrived-at node label.
            const n = def.stops.length;
            this.client.sendEvent('transportArrival', (nextIdxs[0] - 1 + n) % n);
            console.log(`${LOG} Entered ${def.name}. Next candidates: ${nextIdxs.join(',')}`);
        } else if (this.state.kind === 'exiting' && this.state.def === def) {
            this.stagedSet.clear();
            this.go({ kind: 'on_board', def, next: this.state.next });
            console.log(`${LOG} Re-entered ${def.name}`);
        }
    }

    private onStart(def: Def): void {
        if (this.state.kind !== 'on_board' || this.state.def !== def || this.state.leg) return;

        const s = this.state;
        const now = Date.now();

        if (s.next.size === 1) {
            const stopIdx = [...s.next][0];
            this.go({ kind: 'on_board', def, next: s.next, leg: { stopIdx, startedAt: now }, departed: true });
            this.startLegTimer(def, stopIdx, now);
        } else {
            // Direction unknown — mark departed so onSet can start the leg when resolved
            this.go({ kind: 'on_board', def, next: s.next, departed: true });
        }

        this.client.emit('transportDeparture');
        console.log(`${LOG} Departed ${def.name}`);
    }

    private onStop(def: Def, stopIdx: number): void {
        if (this.state.kind === 'idle' || this.state.kind === 'pending') {
            // Logged in on board, or outside
            if (gmcp.room?.info?.map) {
                this.setBoardBind(def);
                return;
            }
            // On board with no map — adopt this definition
            const n = def.stops.length;
            const siblings = def.stopGroups.get(def.stops[stopIdx].patternKey) ?? [stopIdx];
            const next = new Set(siblings.map(i => (i + 1) % n));
            this.go({ kind: 'on_board', def, next });
            this.client.Map.setMapRoomById(def.stops[stopIdx].destination);
            this.setExitBind(def);
            this.client.sendEvent('transportArrival', stopIdx);
            console.log(`${LOG} Adopted ${def.name} from stop pattern at ${stopIdx}`);
            return;
        }

        if (this.state.kind !== 'on_board' && this.state.kind !== 'exiting') return;
        if (this.state.def !== def) return;

        const s = this.state;
        const n = def.stops.length;

        // Validate: if we're traveling we expect this specific stop
        if (s.kind === 'on_board' && s.leg && s.leg.stopIdx !== stopIdx) return;
        // If we have candidates and this stop isn't one of them, ignore
        if (s.kind === 'on_board' && !s.leg && s.next.size > 0 && !s.next.has(stopIdx)) return;

        // Record timing
        if (s.kind === 'on_board' && s.leg) {
            this.recordSegment(def, stopIdx, s.leg.startedAt, Date.now());
        }

        const next = new Set([(stopIdx + 1) % n]);
        const onBoard = s.kind === 'on_board';

        this.go({ kind: 'on_board', def, next }); // at stop, no leg

        if (onBoard) {
            this.client.Map.setMapRoomById(def.stops[stopIdx].destination);
            this.setExitBind(def);
        } else {
            // Was exiting but received stop pattern — back on board
            this.client.Map.setMapRoomById(def.stops[stopIdx].destination);
            this.setExitBind(def);
        }
        this.client.sendEvent('transportArrival', stopIdx);
        console.log(`${LOG} Arrived at stop ${stopIdx} on ${def.name}`);
    }

    private onSet(def: Def, stopIdx: number): void {
        const s = this.state;

        if (s.kind === 'on_board' && s.def === def) {
            const n = def.stops.length;

            if (s.next.has(stopIdx) && s.next.size > 1) {
                // Disambiguate — this stop is our next destination
                const existingLeg = s.leg?.stopIdx === stopIdx ? s.leg : undefined;
                const leg = existingLeg ?? this.startLegIfDeparted(s, stopIdx);
                this.go({ kind: 'on_board', def, next: new Set([stopIdx]), leg, departed: s.departed });
                if (!existingLeg && leg) this.startLegTimer(def, stopIdx, leg.startedAt);
                console.log(`${LOG} Set pattern disambiguated to stop ${stopIdx} on ${def.name}`);
                return;
            }

            // set_pattern on stop i announces the segment after i; next segment is (i+1)
            const nextIdx = (stopIdx + 1) % n;
            if (s.next.has(nextIdx) && s.next.size > 1) {
                const existingLeg = s.leg?.stopIdx === nextIdx ? s.leg : undefined;
                const leg = existingLeg ?? this.startLegIfDeparted(s, nextIdx);
                this.go({ kind: 'on_board', def, next: new Set([nextIdx]), leg, departed: s.departed });
                if (!existingLeg && leg) this.startLegTimer(def, nextIdx, leg.startedAt);
                console.log(`${LOG} Set pattern resolved next to stop ${nextIdx} on ${def.name}`);
                return;
            }

            // Same start location — direction correction
            if (!s.next.has(stopIdx)) {
                const curIdx = [...s.next][0];
                if (curIdx !== undefined && def.stops[curIdx]?.start === def.stops[stopIdx]?.start) {
                    const existingLeg = s.leg && s.leg.stopIdx !== stopIdx ? undefined : s.leg;
                    const leg = existingLeg ?? this.startLegIfDeparted(s, stopIdx);
                    this.go({ kind: 'on_board', def, next: new Set([stopIdx]), leg, departed: s.departed });
                    if (!existingLeg && leg) this.startLegTimer(def, stopIdx, leg.startedAt);
                    console.log(`${LOG} Set pattern corrected to stop ${stopIdx} on ${def.name}`);
                }
            }
            return;
        }

        if (s.kind === 'pending' && s.defs.has(def)) {
            const nextIdxs = s.defs.get(def)!;
            if (nextIdxs.includes(stopIdx)) {
                if (!gmcp.room?.info?.map) {
                    // On board after login, set pattern arrived before stop pattern
                    this.go({ kind: 'on_board', def, next: new Set([stopIdx]) });
                    this.setExitBind(def);
                    console.log(`${LOG} Adopted ${def.name} from set pattern`);
                } else {
                    // Board command issued but not yet entered — narrow the pending candidate
                    const newDefs = new Map(s.defs);
                    newDefs.set(def, [stopIdx]);
                    this.go({ kind: 'pending', defs: newDefs });
                    console.log(`${LOG} Pending direction narrowed: ${def.name} stop ${stopIdx}`);
                }
            }
            return;
        }

        if (s.kind === 'idle' && gmcp.room?.info?.map) {
            // Standing at stop, saw the departure announcement before boarding
            const stop = def.stops[stopIdx];
            if (typeof this.locationId === 'number' && stop.start === this.locationId) {
                this.stagedSet.set(def, stopIdx);
                console.log(`${LOG} Staged departure direction: ${def.name} stop ${stopIdx}`);
            }
        }
    }

    private startLegIfDeparted(s: { departed?: boolean }, stopIdx: number): Leg | undefined {
        if (!s.departed) return undefined;
        return { stopIdx, startedAt: Date.now() };
    }

    private onExit(def: Def): void {
        if (this.state.kind !== 'on_board' || this.state.def !== def) return;
        const { next } = this.state;
        this.go({ kind: 'exiting', def, next });
        this.exitTimeout = setTimeout(() => this.goIdle(), EXIT_TIMEOUT_MS);
        console.log(`${LOG} Exiting ${def.name}`);
    }

    private onExitFailed(): void {
        if (this.state.kind !== 'exiting') return;
        const { def, next } = this.state;
        this.go({ kind: 'on_board', def, next });
        console.log(`${LOG} Exit failed on ${def.name}`);
    }

    private onAbort(): void {
        if (this.state.kind === 'idle') return;
        console.log(`${LOG} Aborted`);
        this.goIdle();
    }

    private onReset(): void { this.goIdle(); }

    private onLocationChange(id: number | null): void {
        this.prevLocationId = this.locationId;
        this.locationId = id;
        // Evict staged directions that were for the previous stop
        if (typeof id === 'number') {
            for (const [def, stopIdx] of this.stagedSet) {
                if (def.stops[stopIdx].start !== id) this.stagedSet.delete(def);
            }
        }
        // on_board/exiting: do not clear here — transport stops also fire location events.
        // onGmcpMap(true) is the reliable disembark signal.
    }

    private onGmcpMap(hasMap: boolean): void {
        if (hasMap && (this.state.kind === 'on_board' || this.state.kind === 'exiting')) {
            this.goIdle();
        }
    }

    private onCommand(cmd: string): void {
        const parts = cmd.split(/[#:;]/).map(p => p.trim().toLowerCase()).filter(Boolean);
        for (const part of parts) {
            if (BOARD_COMMANDS.has(part)) {
                const locId = this.locationId ?? this.prevLocationId;
                if (typeof locId === 'number') this.onBoardCommand(locId);
            } else if (this.exitCmds.has(part)) {
                if (this.state.kind === 'on_board') this.onExit(this.state.def);
            }
        }
    }

    // ── display ───────────────────────────────────────────────────────────────

    private displayStopIndex(): number | undefined {
        const s = this.state;
        if (s.kind !== 'on_board' && s.kind !== 'exiting') return undefined;

        if (s.kind === 'on_board' && s.leg) {
            return s.leg.stopIdx; // traveling — current leg
        }
        if (s.next.size === 1) {
            return [...s.next][0]; // at stop — show upcoming leg (consistent with timer)
        }
        return undefined;
    }

    private emit(): void {
        this.emitTimer();
        this.emitRoute();
    }

    private emitTimer(): void {
        const s = this.state;
        if (s.kind !== 'on_board' || !s.leg) {
            // At stop or not on board — show next segment label with full time
            if (s.kind === 'on_board' && s.next.size === 1) {
                const idx = [...s.next][0];
                const stop = s.def.stops[idx];
                const payload: TransportTimerPayload = {
                    label: stopLabel(s.def, idx),
                    remaining: typeof stop.time === 'number' ? stop.time : null,
                    total: typeof stop.time === 'number' ? stop.time : null,
                };
                this.client.sendEvent('transportTimer', payload);
            } else {
                this.client.sendEvent('transportTimer', null);
            }
            return;
        }
        this.updateTimer(s.def, s.leg.stopIdx, s.leg.startedAt);
    }

    private updateTimer(def: Def, stopIdx: number, startedAt: number): void {
        const stop = def.stops[stopIdx];
        const elapsed = (Date.now() - startedAt) / 1000;
        const hasDuration = typeof stop.time === 'number' && !Number.isNaN(stop.time);
        const payload: TransportTimerPayload = {
            label: stopLabel(def, stopIdx),
            remaining: hasDuration ? Math.max(0, stop.time! - elapsed) : null,
            total: hasDuration ? stop.time! : null,
        };
        this.client.sendEvent('transportTimer', payload);
    }

    private emitRoute(): void {
        const s = this.state;
        if (s.kind === 'idle' || s.kind === 'pending') {
            this.client.sendEvent('transportRoute', null);
            return;
        }
        const { def } = s;
        const activeIdx = this.displayStopIndex();
        const stops: TransportRouteStop[] = def.stops.map(stop => ({
            label: destLabel(def, def.stops.indexOf(stop)),
            durationSeconds: typeof stop.time === 'number' && !Number.isNaN(stop.time) ? stop.time : null,
        }));
        const uniqueDests = new Set(def.stops.map(s => s.destination));
        const payload: TransportRoutePayload = {
            transportName: def.name,
            originLabel: def.locationLabels.get(def.stops[0].start) ?? '',
            stops,
            activeStopIndex: activeIdx,
            onBoard: s.kind === 'on_board',
            loop: def.stops.length > 0 && uniqueDests.size === def.stops.length,
        };
        this.client.sendEvent('transportRoute', payload);
    }

    // ── binds ─────────────────────────────────────────────────────────────────

    private setBoardBind(def: Def, sound = false): void {
        const cmds = def.board_commands;
        if (!cmds?.length) return;
        if (sound) this.client.sendEvent('sound:category', 'transport');
        const label = cmds.join(';');
        this.client.FunctionalBind.setCategory('transport', label, () => {
            cmds.forEach(cmd => this.client.sendCommand(cmd));
        }, false);
    }

    private setExitBind(def: Def): void {
        const cmd = def.exitCommand;
        if (!cmd) return;
        this.client.sendEvent('sound:category', 'transport');
        this.client.FunctionalBind.setCategory('transport', cmd, () => {
            this.client.sendCommand(cmd);
        }, false);
    }

    // ── leg timer ─────────────────────────────────────────────────────────────

    private startLegTimer(def: Def, stopIdx: number, startedAt: number): void {
        this.clearLegTimer();
        const stop = def.stops[stopIdx];
        if (typeof stop.time !== 'number' || Number.isNaN(stop.time)) return;
        this.legTimer = setInterval(() => {
            if (this.state.kind === 'on_board' && this.state.leg?.stopIdx === stopIdx) {
                this.updateTimer(def, stopIdx, startedAt);
            } else {
                this.clearLegTimer();
            }
        }, 500);
    }

    private clearLegTimer(): void {
        if (this.legTimer) {
            clearInterval(this.legTimer);
            this.legTimer = undefined;
        }
    }

    // ── duration overrides ────────────────────────────────────────────────────

    private async loadOverrides(): Promise<void> {
        try {
            const records = await getAllTransportSegments();
            for (const r of records) {
                const def = this.defs.find(d => d.name === r.transport);
                if (!def) continue;
                def.stops.forEach((stop, i) => {
                    if (stop.start === r.fromId && stop.destination === r.toId) {
                        const key = segKey(def, i);
                        const cur = this.durationOverrides.get(key);
                        if (cur === undefined || r.shortestDuration.duration < cur) {
                            this.durationOverrides.set(key, r.shortestDuration.duration);
                            stop.time = r.shortestDuration.duration;
                        }
                    }
                });
            }
        } catch (e) {
            console.warn(`${LOG} Failed to load duration overrides`, e);
        }
    }

    private recordSegment(def: Def, stopIdx: number, startedAt: number, endedAt: number): void {
        const stop = def.stops[stopIdx];
        const elapsed = (endedAt - startedAt) / 1000;
        void recordTransportSegment({
            transport: def.name,
            fromId: stop.start,
            toId: stop.destination,
            fromLabel: def.locationLabels.get(stop.start) ?? String(stop.start),
            toLabel: destLabel(def, stopIdx),
            startedAt, endedAt, duration: elapsed,
            expectedDuration: typeof stop.time === 'number' ? stop.time : null,
        });
        // Update override if faster
        const key = segKey(def, stopIdx);
        const cur = this.durationOverrides.get(key);
        if (cur === undefined || elapsed < cur) {
            this.durationOverrides.set(key, elapsed);
            stop.time = elapsed;
            if (this.state.kind === 'on_board' && this.state.leg?.stopIdx === stopIdx) {
                this.updateTimer(def, stopIdx, this.state.leg.startedAt);
            }
        }
    }

    // ── trigger registration ──────────────────────────────────────────────────

    private registerTriggers(): void {
        // Board / exit commands
        this.client.on('command', (cmd = '') => this.onCommand(cmd));

        // Location tracking
        this.client.on('enterLocation', (payload) => {
            const id = (payload as { id?: number })?.id ?? null;
            this.onLocationChange(typeof id === 'number' ? id : null);
        });

        // GMCP map indicator
        this.client.on('gmcp.room.info', (detail) => {
            const hasMap = !!(detail as { map?: unknown })?.map;
            this.onGmcpMap(hasMap);
        });

        // Reset
        this.client.on('reset', () => this.onReset());

        // Per-definition patterns
        for (const def of this.defs) {
            if (def.enterPattern) {
                this.client.Triggers.registerTrigger(def.enterPattern, () => {
                    this.onEnter(def);
                    return undefined;
                }, 'transport');
            }
            if (def.exitPattern) {
                this.client.Triggers.registerTrigger(def.exitPattern, line => {
                    this.onExit(def);
                    return line;
                }, 'transport');
            }
            if (def.startPattern) {
                this.client.Triggers.registerTrigger(def.startPattern, () => {
                    this.onStart(def);
                    return undefined;
                }, 'transport');
            }
            for (const [i, stop] of def.stops.entries()) {
                if (stop.stopRegex) {
                    this.client.Triggers.registerTrigger(stop.stopRegex, () => {
                        this.onStop(def, i);
                        return undefined;
                    }, 'transport');
                }
                if (stop.setRegex) {
                    this.client.Triggers.registerTrigger(stop.setRegex, () => {
                        this.onSet(def, i);
                        return undefined;
                    }, 'transport');
                }
            }
        }

        // Standing patterns (board bind when vehicle is in room)
        const standingParent = this.client.Triggers.registerTrigger(isType('room.contents.object'), undefined, 'transport');
        const patternToDefs = new Map<string, Def[]>();
        for (const def of this.defs) {
            for (const pattern of (def.standing_patterns ?? [])) {
                const key = pattern.startsWith('^') ? pattern : pattern.toLowerCase();
                const arr = patternToDefs.get(key) ?? [];
                arr.push(def);
                patternToDefs.set(key, arr);
            }
        }
        for (const [pattern, defs] of patternToDefs) {
            const isRegex = pattern.startsWith('^');
            const trigger = isRegex ? new RegExp(pattern, 'i') : pattern;
            standingParent.registerChild(trigger, triggerLine => {
                const locId = this.locationId ?? this.prevLocationId;
                const matched = typeof locId === 'number'
                    ? defs.find(d => d.stops.some(s => s.start === locId))
                    : undefined;
                this.setBoardBind(matched ?? defs[0]);
                return triggerLine;
            }, 'transport', isRegex ? undefined : { caseInsensitive: true });
        }

        // Exit failure
        this.client.Triggers.registerTrigger(EXIT_FAILURE_RE, line => {
            this.onExitFailed();
            return line;
        }, 'transport');

        // Abort (jumped overboard)
        this.client.Triggers.registerTrigger(ABORT_RE, () => {
            this.onAbort();
            return undefined;
        }, 'transport');

        // Follow-exit (following someone off)
        this.client.Triggers.registerTrigger(FOLLOW_EXIT_RE, line => {
            if (this.state.kind === 'on_board') this.onExit(this.state.def);
            return line;
        }, 'transport');

        // Debug toggle alias
        this.client.aliases.push({
            pattern: /^\/tdebug$/,
            callback: () => this.client.sendEvent('transportDebug.toggle', undefined),
        });
    }
}

export default function initTransportTracker(client: Client): void {
    new Tracker(client);
}
