import Client from "../Client";
import { isDirection } from "@shared/map";
import type { TransportTimerPayload, TransportRoutePayload, TransportRouteStop } from "../types/transport";
import type { GmcpRoomInfo } from "@shared/events";
import { getAllTransportSegments, recordTransportSegment } from "../utils/transportStats";
import type { StoredTransportSegmentRecord } from "../utils/transportStats";

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
import WyzimaOxenfurt from "./other/Wyzima - Oxenfurt.json";
import QuenellesMontlacMerceauxDesclouxParravon from "./other/Quenelles - Montlac - Merceaux-Descloux - Parravon.json";

const BOARD_COMMANDS = new Set([
    "wsiadz na statek",
    "wejdz na statek",
    "wejdz na prom",
    "wsiadz na prom",
    "wsiadz do dylizansu",
    "wsiadz do wozu",
    "wsiadz do powozu",
    "wjedz na statek",
]);

const EXIT_FAILURE_PATTERNS: RegExp[] = [
    /^Wolisz nie probowac wysiasc z jadacego .*\.$/,
];

const ABORT_PATTERNS: RegExp[] = [
    /^Jednym susem przesadzasz burte .* i wskakujesz do wody\. Po chwili udaje ci sie doplynac z powrotem do brzegu\.$/,
];

const EXIT_TIMEOUT_MS = 30_000;

const LOG_PREFIX = "[Transport]";

interface RawTransportStop {
    start: number;
    destination: number;
    time?: number;
    stop_pattern: string;
    set_pattern?: string;
    label?: string;
}

interface RawTransportDefinition {
    enter?: string;
    exit?: string;
    start?: string;
    bind?: string;
    exit_command?: string;
    show_path?: boolean;
    stops: RawTransportStop[];
}

const RAW_DEFINITION_ENTRIES: Array<[string, RawTransportDefinition]> = [
    ["Ancelmus", Ancelmus as RawTransportDefinition],
    ["Annibale", Annibale as RawTransportDefinition],
    ["Asa", Asa as RawTransportDefinition],
    ["Batista", Batista as RawTransportDefinition],
    ["Bjorn", Bjorn as RawTransportDefinition],
    ["Cern", Cern as RawTransportDefinition],
    ["Charonda", Charonda as RawTransportDefinition],
    ["Creyard", Creyard as RawTransportDefinition],
    ["Daniel", Daniel as RawTransportDefinition],
    ["Elich", Elich as RawTransportDefinition],
    ["Flavius", Flavius as RawTransportDefinition],
    ["Francois", Francois as RawTransportDefinition],
    ["Gervais", Gervais as RawTransportDefinition],
    ["Gmeath", Gmeath as RawTransportDefinition],
    ["Gvidon", Gvidon as RawTransportDefinition],
    ["Hallgerda", Hallgerda as RawTransportDefinition],
    ["Haming", Haming as RawTransportDefinition],
    ["Jacob", Jacob as RawTransportDefinition],
    ["Kelim", Kelim as RawTransportDefinition],
    ["Louis", Louis as RawTransportDefinition],
    ["Luiggi", Luiggi as RawTransportDefinition],
    ["Malacius", Malacius as RawTransportDefinition],
    ["Mallcolm", Mallcolm as RawTransportDefinition],
    ["Olaf", Olaf as RawTransportDefinition],
    ["Pluskolec", Pluskolec as RawTransportDefinition],
    ["Rygwit", Rygwit as RawTransportDefinition],
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
    ["Wyzima - Oxenfurt", WyzimaOxenfurt as RawTransportDefinition],
    [
        "Quenelles - Montlac - Merceaux-Descloux - Parravon",
        QuenellesMontlacMerceauxDesclouxParravon as RawTransportDefinition,
    ],
];

type TimerHandle = ReturnType<typeof setInterval>;
type TimeoutHandle = ReturnType<typeof setTimeout>;

interface CompiledTransportStop extends RawTransportStop {
    stopRegex: RegExp;
    setRegex?: RegExp;
    patternKey: string;
}

interface CompiledTransportDefinition extends RawTransportDefinition {
    name: string;
    enterPattern?: RegExp;
    exitPattern?: RegExp;
    startPattern?: RegExp;
    stops: CompiledTransportStop[];
    exitCommand?: string;
    locationLabels: Map<number, string>;
    stopPatternGroups: Map<string, number[]>;
    setPatternGroups: Map<string, number[]>;
}

interface JourneyState {
    definition: CompiledTransportDefinition;
    candidateIndexes: Set<number>;
    activeIndex?: number;
    startTimes: Map<number, number>;
    onBoard: boolean;
    timer?: TimerHandle;
    exitTimeout?: TimeoutHandle;
}

function describeStopList(definition: CompiledTransportDefinition, indexes: Iterable<number>): string {
    const labels: string[] = [];
    for (const index of indexes) {
        const stop = definition.stops[index];
        if (stop) {
            labels.push(formatLabel(definition, stop));
        }
    }
    if (labels.length === 0) {
        return "none";
    }
    return labels.join(", ");
}

function createPattern(pattern?: string): RegExp | undefined {
    if (!pattern) {
        return undefined;
    }
    return new RegExp(pattern);
}

function loadDefinitions(): CompiledTransportDefinition[] {
    return RAW_DEFINITION_ENTRIES.map(([name, data]) => {
        const locationLabels = new Map<number, string>();
        for (const stop of data.stops) {
            const trimmed = (stop.label ?? "").trim();
            const resolved = trimmed.length > 0 ? trimmed : String(stop.destination);
            locationLabels.set(stop.destination, resolved);
        }
        for (const stop of data.stops) {
            if (!locationLabels.has(stop.start)) {
                locationLabels.set(stop.start, String(stop.start));
            }
        }
        const compiledStops = data.stops.map(stop => ({
            ...stop,
            label: (stop.label ?? "").trim() || undefined,
            stopRegex: new RegExp(stop.stop_pattern),
            setRegex: stop.set_pattern ? new RegExp(stop.set_pattern) : undefined,
            patternKey: stop.stop_pattern,
        }));
        const stopPatternGroups = new Map<string, number[]>();
        const setPatternGroups = new Map<string, number[]>();
        compiledStops.forEach((stop, index) => {
            const key = stop.patternKey;
            const existing = stopPatternGroups.get(key);
            if (existing) {
                existing.push(index);
            } else {
                stopPatternGroups.set(key, [index]);
            }
            if (stop.set_pattern) {
                const setGroup = setPatternGroups.get(stop.set_pattern);
                if (setGroup) {
                    setGroup.push(index);
                } else {
                    setPatternGroups.set(stop.set_pattern, [index]);
                }
            }
        });
        return {
            ...data,
            name,
            enterPattern: createPattern(data.enter),
            exitPattern: createPattern(data.exit),
            startPattern: createPattern(data.start),
            stops: compiledStops,
            exitCommand: data.exit_command ? data.exit_command.toLowerCase() : undefined,
            locationLabels,
            stopPatternGroups,
            setPatternGroups,
        };
    });
}

function resolveLocationLabel(definition: CompiledTransportDefinition, locationId: number): string {
    const label = definition.locationLabels.get(locationId);
    if (label && label.trim().length > 0) {
        return label;
    }
    return String(locationId);
}

function resolveDestinationLabel(definition: CompiledTransportDefinition, stop: CompiledTransportStop): string {
    if (stop.label && stop.label.trim().length > 0) {
        return stop.label.trim();
    }
    return resolveLocationLabel(definition, stop.destination);
}

function formatLabel(definition: CompiledTransportDefinition, stop: CompiledTransportStop): string {
    const from = resolveLocationLabel(definition, stop.start);
    const destinationLabel = resolveDestinationLabel(definition, stop);
    if (from === destinationLabel) {
        return destinationLabel;
    }
    return `${from} → ${destinationLabel}`;
}

function secondsBetween(start: number): number {
    return (Date.now() - start) / 1000;
}

function createSegmentKey(transport: string, fromId: number, toId: number): string {
    return `${transport}::${fromId}->${toId}`;
}

class TransportTracker {
    private client: Client;
    private definitions: CompiledTransportDefinition[];
    private definitionsByName: Map<string, CompiledTransportDefinition>;
    private currentJourney: JourneyState | null = null;
    private pendingCandidates = new Map<CompiledTransportDefinition, number[]>();
    private currentLocationId: number | null = null;
    private previousLocationId: number | null = null;
    private exitCommands: Set<string>;
    private segmentDurationOverrides = new Map<string, number>();

    constructor(client: Client) {
        this.client = client;
        this.definitions = loadDefinitions();
        this.definitionsByName = new Map(this.definitions.map(def => [def.name, def]));
        this.exitCommands = new Set(
            this.definitions
                .map(def => def.exitCommand)
                .filter((cmd): cmd is string => typeof cmd === "string" && cmd.length > 0)
        );
        this.registerTriggers();
        this.registerExitFailureTriggers();
        this.registerAbortTriggers();
        this.registerFollowExitTriggers();
        this.registerListeners();
        this.emitTimer(null);
        this.emitRoute();
        void this.loadSegmentDurationOverrides();
    }

    private async loadSegmentDurationOverrides() {
        try {
            const records = await getAllTransportSegments();
            this.applyStoredSegmentDurations(records);
        } catch (error) {
            console.warn("[Transport] Failed to load stored transport segment durations", error);
        }
    }

    private applyStoredSegmentDurations(records: StoredTransportSegmentRecord[]) {
        for (const record of records) {
            const definition = this.definitionsByName.get(record.transport);
            if (!definition) {
                continue;
            }
            definition.stops.forEach((stop, index) => {
                if (stop.start === record.fromId && stop.destination === record.toId) {
                    this.applyDurationOverride(definition, index, record.shortestDuration.duration);
                }
            });
        }
    }

    private applyDurationOverride(definition: CompiledTransportDefinition, index: number, duration: number) {
        if (!Number.isFinite(duration) || duration <= 0) {
            return;
        }

        const stop = definition.stops[index];
        if (!stop) {
            return;
        }

        const key = createSegmentKey(definition.name, stop.start, stop.destination);
        if (duration < 1) {
            const existing = this.segmentDurationOverrides.get(key);
            if (existing !== undefined && existing <= duration) {
                return;
            }
            if (!this.segmentDurationOverrides.has(key)) {
                return;
            }
        }

        const existingOverride = this.segmentDurationOverrides.get(key);
        const nextDuration = existingOverride !== undefined ? Math.min(existingOverride, duration) : duration;

        if (existingOverride !== undefined && existingOverride <= nextDuration) {
            return;
        }

        this.segmentDurationOverrides.set(key, nextDuration);
        stop.time = nextDuration;

        if (
            this.currentJourney &&
            this.currentJourney.definition === definition &&
            this.currentJourney.activeIndex === index
        ) {
            const startedAt = this.currentJourney.startTimes.get(index);
            if (typeof startedAt === "number") {
                this.updateTimer(definition, stop, startedAt);
            } else {
                this.refreshTimer(this.currentJourney);
            }
        }
    }

    private registerListeners() {
        this.client.on("command", (cmd = "") => {
            this.handleCommand(cmd);
        });
        this.client.on("enterLocation", (payload) => {
            const nextId = typeof (payload as { id?: number })?.id === "number" ? (payload as { id: number }).id : null;
            const previous = this.currentLocationId;
            this.previousLocationId = previous;
            this.currentLocationId = nextId;
            if (this.currentJourney && !this.currentJourney.onBoard && previous !== null && nextId !== previous) {
                this.clearJourney();
            }
        });
        this.client.on("gmcp.room.info", (detail) => {
            const info = detail as GmcpRoomInfo;
            if (info?.map && this.currentJourney) {
                this.clearJourney();
            }
        });
        this.client.on("reset", () => {
            this.clearJourney();
        });
    }

    private registerTriggers() {
        this.definitions.forEach(definition => {
            if (definition.enterPattern) {
                this.client.Triggers.registerTrigger(definition.enterPattern, () => {
                    this.handleEnter(definition);
                    return undefined;
                }, "transport-tracker");
            }
            if (definition.exitPattern) {
                this.client.Triggers.registerTrigger(definition.exitPattern, (triggerLine) => {
                    const line = triggerLine.text;
                    this.handleExit(definition, line);
                    return triggerLine;
                }, "transport-tracker");
            }
            if (definition.startPattern) {
                this.client.Triggers.registerTrigger(definition.startPattern, () => {
                    this.handleStart(definition);
                    return undefined;
                }, "transport-tracker");
            }
            definition.stops.forEach((stop, index) => {
                this.client.Triggers.registerTrigger(stop.stopRegex, () => {
                    this.handleStop(definition, index);
                    return undefined;
                }, "transport-tracker");
                if (stop.setRegex) {
                    this.client.Triggers.registerTrigger(stop.setRegex, () => {
                        this.handleSet(definition, index);
                        return undefined;
                    }, "transport-tracker");
                }
            });
        });
    }

    private registerExitFailureTriggers() {
        EXIT_FAILURE_PATTERNS.forEach(pattern => {
            this.client.Triggers.registerTrigger(pattern, (triggerLine) => {
                const line = triggerLine.text;
                this.handleExitFailure(line);
                return triggerLine;
            }, "transport-tracker");
        });
    }

    private registerFollowExitTriggers() {
        this.client.Triggers.registerTrigger(/[pP]odazasz za .* na zewnatrz\.$/, (triggerLine) => {
            this.handleExit();
            return triggerLine;
        }, "transport-tracker");
    }

    private registerAbortTriggers() {
        ABORT_PATTERNS.forEach(pattern => {
            this.client.Triggers.registerTrigger(pattern, () => {
                this.handleAbort();
                return undefined;
            }, "transport-tracker");
        });
    }

    private handleAbort() {
        if (!this.currentJourney) {
            return;
        }
        this.log(`Trip aborted on ${this.currentJourney.definition.name}.`);
        this.clearJourney();
    }

    private handleCommand(command: string) {
        if (!command) {
            return;
        }
        const segments = command
            .split(/[#:;]/)
            .map(part => part.trim())
            .filter(part => part.length > 0);
        segments.forEach(part => {
            const normalized = part.toLowerCase();
            if (BOARD_COMMANDS.has(normalized)) {
                const locationId = this.currentLocationId ?? this.previousLocationId;
                if (typeof locationId === "number") {
                    this.prepareCandidatesFromLocation(locationId);
                }
                return;
            }
            if (this.exitCommands.has(normalized)) {
                this.markOutOfTransport();
                return;
            }
            if (this.currentJourney && !this.currentJourney.onBoard && this.isMovementCommand(normalized)) {
                this.clearJourney();
            }
        });
    }

    private isMovementCommand(command: string): boolean {
        if (!command) {
            return false;
        }
        if (isDirection(command)) {
            return true;
        }
        return (
            command.startsWith("idz ") ||
            command === "idz" ||
            command.startsWith("przemknij ") ||
            command.startsWith("przemknij z druzyna ") ||
            command.startsWith("jedz na ")
        );
    }

    private prepareCandidatesFromLocation(locationId: number) {
        const matches = new Map<CompiledTransportDefinition, number[]>();
        this.definitions.forEach(definition => {
            const indexes = this.collectIndexes(definition, locationId);
            if (indexes.length > 0) {
                matches.set(definition, indexes);
            }
        });
        this.pendingCandidates = matches;
        if (this.currentJourney && matches.has(this.currentJourney.definition)) {
            const candidateIndexes = matches.get(this.currentJourney.definition)!;
            if (this.currentJourney.candidateIndexes.size > 0) {
                const intersection = candidateIndexes.filter(index => this.currentJourney!.candidateIndexes.has(index));
                if (intersection.length > 0) {
                    this.applyCandidateIndexes(this.currentJourney, intersection, false);
                    this.log(
                        `Refined candidates from location ${locationId} for ${this.currentJourney.definition.name}. Candidates: ${this.describeCandidates(this.currentJourney)}`
                    );
                    return;
                }
            }
            this.applyCandidateIndexes(this.currentJourney, candidateIndexes);
            this.log(
                `Reset candidates from location ${locationId} for ${this.currentJourney.definition.name}. Candidates: ${this.describeCandidates(this.currentJourney)}`
            );
        } else if (!this.currentJourney && matches.size === 1) {
            const [definition, candidateIndexes] = matches.entries().next().value as [CompiledTransportDefinition, number[]];
            const journey = this.ensureJourney(definition);
            this.applyCandidateIndexes(journey, candidateIndexes);
            this.log(`Prepared candidates from location ${locationId} for ${definition.name}. Candidates: ${this.describeCandidates(journey)}`);
        }
    }

    private handleEnter(definition: CompiledTransportDefinition) {
        if (!this.shouldHandle(definition)) {
            return;
        }
        const journey = this.ensureJourney(definition);
        const startId = this.previousLocationId ?? this.currentLocationId ?? null;
        if (typeof startId === "number") {
            const indexes = this.collectIndexes(definition, startId);
            if (indexes.length > 0) {
                if (journey.candidateIndexes.size > 0) {
                    const intersection = indexes.filter(index => journey.candidateIndexes.has(index));
                    if (intersection.length > 0) {
                        this.applyCandidateIndexes(journey, intersection, false);
                    } else {
                        this.applyCandidateIndexes(journey, indexes);
                    }
                } else {
                    this.applyCandidateIndexes(journey, indexes);
                }
            }
        }
        if (journey.candidateIndexes.size === 0) {
            this.applyCandidateIndexes(journey, definition.stops.map((_, idx) => idx), false);
        }
        journey.onBoard = true;
        this.cancelExitTimeout(journey);
        this.pendingCandidates.delete(definition);
        this.log(`Entered ${definition.name}. Candidate stops: ${this.describeCandidates(journey)}`);
        this.refreshTimer(journey);
        this.emitRoute();

        // If we're at a stop (not mid-travel), emit arrival for the current stop
        if (journey.activeIndex === undefined && journey.candidateIndexes.size > 0) {
            const numStops = definition.stops.length;
            const firstCandidate = journey.candidateIndexes.values().next().value as number;
            const arrivedIndex = (firstCandidate - 1 + numStops) % numStops;
            this.client.sendEvent("transportArrival", arrivedIndex);
        }
    }

    private handleExit(definition?: CompiledTransportDefinition, _line?: string) {
        if (definition && this.currentJourney && this.currentJourney.definition !== definition) {
            return;
        }
        this.markOutOfTransport();
    }

    private handleExitFailure(line?: string) {
        if (!this.currentJourney || this.currentJourney.onBoard) {
            return;
        }
        this.currentJourney.onBoard = true;
        this.cancelExitTimeout(this.currentJourney);
        this.log(`Exit prevented on ${this.currentJourney.definition.name}${line ? ` (${line})` : ""}.`);
        if (this.currentJourney.activeIndex !== undefined) {
            const startedAt = this.currentJourney.startTimes.get(this.currentJourney.activeIndex);
            if (typeof startedAt === "number") {
                this.startCountdown(this.currentJourney, this.currentJourney.activeIndex, startedAt);
                return;
            }
        }
        this.refreshTimer(this.currentJourney);
    }

    private handleStart(definition: CompiledTransportDefinition) {
        if (!this.shouldHandle(definition)) {
            return;
        }
        const journey = this.ensureJourney(definition);
        journey.onBoard = true;
        this.cancelExitTimeout(journey);
        if (journey.candidateIndexes.size === 0) {
            const startId = this.previousLocationId ?? this.currentLocationId ?? null;
            const indexes = typeof startId === "number"
                ? this.collectIndexes(definition, startId)
                : definition.stops.map((_, idx) => idx);
            this.applyCandidateIndexes(journey, indexes);
        }
        const now = Date.now();
        journey.startTimes.clear();
        journey.candidateIndexes.forEach(index => {
            journey.startTimes.set(index, now);
        });
        const activeIndex = this.determineActiveIndex(journey);
        if (activeIndex !== undefined) {
            this.startCountdown(journey, activeIndex, now);
        } else {
            this.emitTimer(null);
        }
        this.pendingCandidates.delete(definition);
        this.log(`Journey on ${definition.name} started. Candidate stops: ${this.describeCandidates(journey)}`);
        this.emitRoute();
        this.client.emit('transportDeparture');
    }

    private handleSet(definition: CompiledTransportDefinition, index: number) {
        const stop = definition.stops[index];

        // Check if we should handle this transport before creating/modifying journey
        const isCurrentJourney = this.currentJourney?.definition === definition;
        const onBoard = isCurrentJourney && this.currentJourney.onBoard;

        if (!onBoard) {
            const locationId = this.currentLocationId ?? this.previousLocationId ?? null;
            const setGroup = stop.set_pattern ? definition.setPatternGroups.get(stop.set_pattern) : undefined;
            if (typeof locationId !== "number") {
                if (!this.currentJourney) {
                    this.adoptFromSetPattern(definition, index);
                    return;
                }
                this.log(
                    `Ignoring set pattern on ${definition.name} for ${formatLabel(
                        definition,
                        stop
                    )} – location unknown while outside transport.`
                );
                return;
            }
            if (stop.start !== locationId) {
                this.log(
                    `Ignoring set pattern on ${definition.name} for ${formatLabel(definition, stop)} – current location ${resolveLocationLabel(definition, locationId)} does not match start ${resolveLocationLabel(definition, stop.start)}.`
                );
                return;
            }

            // Only now create/ensure journey after validation
            const journey = this.ensureJourney(definition);

            let indexes: number[];
            if (setGroup && setGroup.length > 0) {
                const matches = setGroup.filter(candidateIndex => definition.stops[candidateIndex].start === locationId);
                indexes = matches.length > 0 ? matches : [index];
            } else {
                indexes = [index];
            }

            this.applyCandidateIndexes(journey, indexes);
            this.pendingCandidates.set(definition, indexes);
            this.log(
                `Registered set pattern for ${definition.name} at ${resolveLocationLabel(definition, locationId)}. Candidates: ${this.describeCandidates(journey)}`
            );
            return;
        }

        // We're on board - ensure we have the journey
        const journey = this.ensureJourney(definition);

        if (!journey.candidateIndexes.has(index)) {
            // Check if this set_pattern is for a segment starting from the same location as current candidate
            // This handles the case where user re-boards and wants to go in a different direction
            const currentCandidateIndex = journey.candidateIndexes.values().next().value;
            if (currentCandidateIndex !== undefined) {
                const currentStop = definition.stops[currentCandidateIndex];
                if (currentStop && currentStop.start === stop.start) {
                    // Same starting location, different destination - correct the candidate
                    const oldStartedAt = journey.startTimes.get(currentCandidateIndex);
                    this.applyCandidateIndexes(journey, [index], false);
                    journey.activeIndex = index;
                    this.pendingCandidates.delete(definition);
                    if (typeof oldStartedAt === "number") {
                        journey.startTimes.set(index, oldStartedAt);
                        this.startCountdown(journey, index, oldStartedAt);
                    }
                    this.log(`Set pattern corrected direction on ${definition.name}. Active stop: ${formatLabel(definition, stop)}`);
                    this.refreshTimer(journey);
                    this.emitRoute();
                    return;
                }
            }
            // The set_pattern on stop `i` announces what comes after that stop.
            // The next segment to travel is (i+1). If that's among candidates, resolve to it.
            const nextIndex = (index + 1) % definition.stops.length;
            if (journey.candidateIndexes.has(nextIndex)) {
                this.applyCandidateIndexes(journey, [nextIndex], false);
                journey.activeIndex = nextIndex;
                this.pendingCandidates.delete(definition);
                const startedAt = journey.startTimes.get(nextIndex);
                if (typeof startedAt === "number") {
                    this.startCountdown(journey, nextIndex, startedAt);
                }
                this.log(`Set pattern resolved direction on ${definition.name}. Active stop: ${formatLabel(definition, definition.stops[nextIndex])}`);
                this.refreshTimer(journey);
                this.emitRoute();
                return;
            }
            this.log(
                `Ignoring set pattern on ${definition.name} for ${formatLabel(definition, stop)} – not among current candidates (${this.describeCandidates(journey)}).`
            );
            return;
        }

        if (journey.candidateIndexes.size <= 1) {
            this.log(
                `Ignoring set pattern on ${definition.name} for ${formatLabel(definition, stop)} – only ${journey.candidateIndexes.size} candidate(s) while on board.`
            );
            return;
        }

        this.applyCandidateIndexes(journey, [index], false);
        journey.activeIndex = index;
        this.pendingCandidates.delete(definition);
        const startedAt = journey.startTimes.get(index);
        if (typeof startedAt === "number") {
            this.startCountdown(journey, index, startedAt);
        }
        this.log(`Set pattern matched on ${definition.name}. Active stop: ${formatLabel(definition, stop)}`);
        this.refreshTimer(journey);
        this.emitRoute();
    }

    private handleStop(definition: CompiledTransportDefinition, index: number) {
        if (!this.shouldHandle(definition)) {
            this.adoptFromStopPattern(definition, index);
            return;
        }
        const journey = this.ensureJourney(definition);
        const stop = definition.stops[index];

        if (journey.activeIndex !== undefined && journey.activeIndex !== index) {
            const activeStop = journey.definition.stops[journey.activeIndex];
            this.log(
                `Ignoring stop pattern on ${definition.name} for ${formatLabel(definition, stop)} – active segment is ${formatLabel(definition, activeStop)}.`
            );
            return;
        }

        if (journey.activeIndex === undefined && journey.candidateIndexes.size > 0 && !journey.candidateIndexes.has(index)) {
            this.log(
                `Ignoring stop pattern on ${definition.name} for ${formatLabel(definition, stop)} – not among current candidates (${this.describeCandidates(journey)}).`
            );
            return;
        }

        if (journey.activeIndex === undefined) {
            journey.activeIndex = index;
        }

        const startedAt = journey.startTimes.get(index);
        if (typeof startedAt === "number") {
            const endedAt = Date.now();
            const elapsed = (endedAt - startedAt) / 1000;
            const expected = typeof stop.time === "number" ? stop.time : null;
            if (expected !== null) {
                const diff = expected - elapsed;
                if (diff > 0.1) {
                    console.log(
                        `[Transport] Segment to ${formatLabel(definition, stop)} finished ${diff.toFixed(2)}s earlier (expected ${expected.toFixed(2)}s, actual ${elapsed.toFixed(2)}s).`
                    );
                }
            } else {
                console.log(
                    `[Transport] Segment to ${formatLabel(definition, stop)} finished in ${elapsed.toFixed(2)}s (no expected duration).`
                );
            }
            void recordTransportSegment({
                transport: definition.name,
                fromId: stop.start,
                toId: stop.destination,
                fromLabel: resolveLocationLabel(definition, stop.start),
                toLabel: resolveDestinationLabel(definition, stop),
                startedAt,
                endedAt,
                duration: elapsed,
                expectedDuration: expected,
            });
            this.applyDurationOverride(definition, index, elapsed);
        }

        this.stopCountdown();
        journey.startTimes.clear();

        const activeDuringStop = journey.activeIndex!;
        const nextIndex = (index + 1) % journey.definition.stops.length;
        journey.candidateIndexes = new Set([nextIndex]);

        this.log(`Arrived at ${formatLabel(definition, stop)} on ${definition.name}. Next candidate: ${this.describeCandidates(journey)}`);
        this.refreshTimer(journey);
        this.emitRoute();
        this.client.sendEvent("transportArrival", index);

        queueMicrotask(() => {
            if (!this.currentJourney || this.currentJourney !== journey) {
                return;
            }
            if (journey.activeIndex === activeDuringStop) {
                journey.activeIndex = undefined;
            }
        });
    }

    private adoptFromStopPattern(definition: CompiledTransportDefinition, index: number) {
        if (this.currentJourney) {
            return;
        }
        const stop = definition.stops[index];
        const siblingIndexes = definition.stopPatternGroups.get(stop.patternKey) ?? [index];

        const journey = this.ensureJourney(definition);
        journey.onBoard = true;

        if (siblingIndexes.length > 1) {
            // Ambiguous stop pattern — store all possible next stops as candidates
            // and wait for the set_pattern to disambiguate
            const nextIndexes = siblingIndexes.map(i => (i + 1) % definition.stops.length);
            journey.candidateIndexes = new Set(nextIndexes);
            journey.activeIndex = undefined;
            this.log(`Detected ${definition.name} from ambiguous stop pattern at ${formatLabel(definition, stop)}. Candidates: ${this.describeCandidates(journey)}`);
        } else {
            const nextIndex = (index + 1) % definition.stops.length;
            journey.candidateIndexes = new Set([nextIndex]);
            journey.activeIndex = undefined;
            this.log(`Detected ${definition.name} from stop pattern at ${formatLabel(definition, stop)}. Next: ${this.describeCandidates(journey)}`);
        }

        this.refreshTimer(journey);
        this.emitRoute();
        this.client.sendEvent("transportArrival", index);
    }

    private adoptFromSetPattern(definition: CompiledTransportDefinition, index: number) {
        if (this.currentJourney) {
            return;
        }
        const stop = definition.stops[index];
        const setGroup = stop.set_pattern ? definition.setPatternGroups.get(stop.set_pattern) : undefined;
        const siblingIndexes = setGroup && setGroup.length > 0 ? setGroup : [index];

        const journey = this.ensureJourney(definition);
        journey.onBoard = true;
        journey.candidateIndexes = new Set(siblingIndexes);
        journey.activeIndex = undefined;

        if (siblingIndexes.length > 1) {
            this.log(`Detected ${definition.name} from ambiguous set pattern at ${formatLabel(definition, stop)}. Candidates: ${this.describeCandidates(journey)}`);
        } else {
            this.log(`Detected ${definition.name} from set pattern at ${formatLabel(definition, stop)}. Next: ${this.describeCandidates(journey)}`);
        }

        this.refreshTimer(journey);
        this.emitRoute();
    }

    private ensureJourney(definition: CompiledTransportDefinition): JourneyState {
        if (!this.currentJourney || this.currentJourney.definition !== definition) {
            this.stopCountdown();
            if (this.currentJourney) {
                this.cancelExitTimeout(this.currentJourney);
            }
            this.currentJourney = {
                definition,
                candidateIndexes: new Set<number>(),
                startTimes: new Map<number, number>(),
                onBoard: false,
            };
            this.log(`Created journey tracker for ${definition.name}.`);
        }
        return this.currentJourney;
    }

    private applyCandidateIndexes(journey: JourneyState, indexes: number[], resetTimer: boolean = true) {
        if (indexes.length === 0) {
            return;
        }
        journey.candidateIndexes = new Set(indexes);
        if (resetTimer) {
            journey.startTimes.clear();
            journey.activeIndex = undefined;
            this.stopCountdown();
        } else if (journey.activeIndex !== undefined && !journey.candidateIndexes.has(journey.activeIndex)) {
            journey.activeIndex = undefined;
        }
    }

    private determineActiveIndex(journey: JourneyState): number | undefined {
        if (journey.activeIndex !== undefined && journey.candidateIndexes.has(journey.activeIndex)) {
            return journey.activeIndex;
        }
        if (journey.candidateIndexes.size === 1) {
            return journey.candidateIndexes.values().next().value;
        }
        return undefined;
    }

    private startCountdown(journey: JourneyState, index: number, startedAt: number) {
        const stop = journey.definition.stops[index];
        journey.activeIndex = index;
        journey.startTimes.set(index, startedAt);
        const hasDuration = typeof stop.time === "number" && !Number.isNaN(stop.time);
        this.updateTimer(journey.definition, stop, startedAt);
        this.log(
            `Tracking segment on ${journey.definition.name} towards ${formatLabel(journey.definition, stop)}${hasDuration ? " with countdown." : " (no duration available)."}`
        );
        if (journey.timer) {
            clearInterval(journey.timer);
        }
        if (hasDuration) {
            journey.timer = setInterval(() => {
                const currentStart = journey.startTimes.get(index);
                if (typeof currentStart !== "number") {
                    return;
                }
                this.updateTimer(journey.definition, stop, currentStart);
            }, 500);
        } else {
            journey.timer = undefined;
        }
    }

    private updateTimer(definition: CompiledTransportDefinition, stop: CompiledTransportStop, startedAt: number) {
        const elapsed = secondsBetween(startedAt);
        const hasDuration = typeof stop.time === "number" && !Number.isNaN(stop.time);
        const remaining = hasDuration ? Math.max(0, stop.time - elapsed) : null;
        const total = hasDuration ? stop.time : null;
        const payload: TransportTimerPayload = {
            label: formatLabel(definition, stop),
            remaining,
            total,
        };
        this.emitTimer(payload);
    }

    private stopCountdown() {
        if (this.currentJourney?.timer) {
            clearInterval(this.currentJourney.timer);
            this.currentJourney.timer = undefined;
        }
        this.emitTimer(null);
        if (this.currentJourney?.activeIndex !== undefined) {
            const stop = this.currentJourney.definition.stops[this.currentJourney.activeIndex];
            this.log(`Stopped countdown on ${this.currentJourney.definition.name} for ${formatLabel(this.currentJourney.definition, stop)}.`);
        }
    }

    private collectIndexes(definition: CompiledTransportDefinition, startId: number): number[] {
        const indexes: number[] = [];
        definition.stops.forEach((stop, idx) => {
            if (stop.start === startId) {
                indexes.push(idx);
            }
        });
        return indexes;
    }

    private cancelExitTimeout(journey: JourneyState) {
        if (journey.exitTimeout) {
            clearTimeout(journey.exitTimeout);
            journey.exitTimeout = undefined;
        }
    }

    private markOutOfTransport() {
        if (!this.currentJourney) {
            this.pendingCandidates.clear();
            return;
        }
        this.currentJourney.onBoard = false;
        this.stopCountdown();
        this.scheduleCleanup();
        this.log(`Exited ${this.currentJourney.definition.name}. Waiting for re-entry before cleanup.`);
    }

    private scheduleCleanup() {
        if (!this.currentJourney) {
            return;
        }
        this.cancelExitTimeout(this.currentJourney);
        this.currentJourney.exitTimeout = setTimeout(() => {
            if (this.currentJourney && !this.currentJourney.onBoard) {
                this.clearJourney();
            }
        }, EXIT_TIMEOUT_MS);
    }

    private clearJourney() {
        if (this.currentJourney) {
            this.stopCountdown();
            this.cancelExitTimeout(this.currentJourney);
            this.log(`Cleared journey tracker for ${this.currentJourney.definition.name}.`);
        }
        this.currentJourney = null;
        this.pendingCandidates.clear();
        this.emitTimer(null);
        this.emitRoute();
    }

    private shouldHandle(definition: CompiledTransportDefinition): boolean {
        if (this.currentJourney && this.currentJourney.definition === definition) {
            return true;
        }
        return this.pendingCandidates.has(definition);
    }

    private emitTimer(payload: TransportTimerPayload | null) {
        this.client.sendEvent("transportTimer", payload);
    }

    private buildRoutePayload(): TransportRoutePayload | null {
        if (!this.currentJourney) {
            return null;
        }
        const { definition, activeIndex, onBoard } = this.currentJourney;
        const stops: TransportRouteStop[] = definition.stops.map(stop => ({
            label: resolveDestinationLabel(definition, stop),
            durationSeconds: typeof stop.time === "number" && !Number.isNaN(stop.time) ? stop.time : null,
        }));
        const originLabel = resolveLocationLabel(definition, definition.stops[0].start);
        const uniqueDestinations = new Set(definition.stops.map(s => s.destination));
        const loop = definition.stops.length > 0 && uniqueDestinations.size === definition.stops.length;
        return {
            transportName: definition.name,
            originLabel,
            stops,
            activeStopIndex: activeIndex,
            onBoard,
            loop,
        };
    }

    private emitRoute() {
        this.client.sendEvent("transportRoute", this.buildRoutePayload());
    }

    private log(message: string) {
        console.log(`${LOG_PREFIX} ${message}`);
    }

    private describeCandidates(journey: JourneyState): string {
        return describeStopList(journey.definition, journey.candidateIndexes);
    }

    private refreshTimer(journey: JourneyState | null) {
        if (!journey || !journey.onBoard) {
            this.emitTimer(null);
            return;
        }
        const index = this.determineActiveIndex(journey);
        if (index === undefined) {
            const fallbackIndex = this.selectUnknownDurationCandidate(journey);
            if (fallbackIndex === undefined) {
                this.emitTimer(null);
                return;
            }
            const fallbackStop = journey.definition.stops[fallbackIndex];
            const payload: TransportTimerPayload = {
                label: formatLabel(journey.definition, fallbackStop),
                remaining: null,
                total: null,
            };
            this.emitTimer(payload);
            return;
        }
        const stop = journey.definition.stops[index];
        const startedAt = journey.startTimes.get(index);
        if (typeof startedAt === "number") {
            this.updateTimer(journey.definition, stop, startedAt);
            return;
        }
        const payload: TransportTimerPayload = {
            label: formatLabel(journey.definition, stop),
            remaining: typeof stop.time === "number" ? stop.time : null,
            total: typeof stop.time === "number" ? stop.time : null,
        };
        this.emitTimer(payload);
    }

    private selectUnknownDurationCandidate(journey: JourneyState): number | undefined {
        for (const candidate of journey.candidateIndexes) {
            const stop = journey.definition.stops[candidate];
            if (!stop) {
                continue;
            }
            if (typeof stop.time !== "number" || Number.isNaN(stop.time)) {
                return candidate;
            }
        }
        return undefined;
    }
}

export default function initTransportStops(client: Client) {
    new TransportTracker(client);
}
