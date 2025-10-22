import Client from "../Client";
import { isDirection } from "../utils/directions";
import type { TransportTimerPayload } from "../types/transport";

const BOARD_COMMANDS = new Set([
    "wsiadz na statek",
    "wejdz na statek",
    "wejdz na prom",
    "wsiadz na prom",
    "wsiadz do dylizansu",
    "wsiadz do wozu",
    "wjedz na statek",
]);

const EXIT_TIMEOUT_MS = 30_000;

interface RawTransportStop {
    start: number;
    destination: number;
    time: number;
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

type RequireContext = ((key: string) => RawTransportDefinition) & { keys: () => string[] };

type TimerHandle = ReturnType<typeof setInterval>;
type TimeoutHandle = ReturnType<typeof setTimeout>;

interface CompiledTransportStop extends RawTransportStop {
    stopRegex: RegExp;
    setRegex?: RegExp;
}

interface CompiledTransportDefinition extends RawTransportDefinition {
    name: string;
    enterPattern?: RegExp;
    exitPattern?: RegExp;
    startPattern?: RegExp;
    stops: CompiledTransportStop[];
    exitCommand?: string;
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

function createPattern(pattern?: string): RegExp | undefined {
    if (!pattern) {
        return undefined;
    }
    return new RegExp(pattern);
}

function loadContext(directory: string): RequireContext {
    const reqAny = require as any;
    if (typeof reqAny.context !== "function") {
        if (typeof process !== "undefined" && process.env && process.env.IS_JEST === "true") {
            const path = require("path") as typeof import("path");
            const fs = require("fs") as typeof import("fs");
            const baseDir = path.resolve(__dirname, directory.replace(/^\.\//, ""));
            const fileNames = fs
                .readdirSync(baseDir)
                .filter((name: string) => name.toLowerCase().endsWith(".json"))
                .map((name: string) => `./${name}`);
            const loader = ((key: string) => {
                const filePath = path.join(baseDir, key.replace(/^\.\//, ""));
                const content = fs.readFileSync(filePath, "utf-8");
                return JSON.parse(content) as RawTransportDefinition;
            }) as RequireContext;
            loader.keys = () => fileNames;
            return loader;
        }
        throw new Error("require.context is not available");
    }
    return reqAny.context(directory, false, /\.json$/);
}

function loadDefinitions(): CompiledTransportDefinition[] {
    const contexts = [loadContext("./ships"), loadContext("./other")];
    const definitions: CompiledTransportDefinition[] = [];
    contexts.forEach(context => {
        context.keys().forEach(key => {
            const data = context(key);
            const compiledStops = data.stops.map(stop => ({
                ...stop,
                stopRegex: new RegExp(stop.stop_pattern),
                setRegex: stop.set_pattern ? new RegExp(stop.set_pattern) : undefined,
            }));
            definitions.push({
                ...data,
                name: key.replace(/^\.\//, "").replace(/\.json$/i, ""),
                enterPattern: createPattern(data.enter),
                exitPattern: createPattern(data.exit),
                startPattern: createPattern(data.start),
                stops: compiledStops,
                exitCommand: data.exit_command ? data.exit_command.toLowerCase() : undefined,
            });
        });
    });
    return definitions;
}

function formatLabel(stop: CompiledTransportStop): string {
    if (stop.label && stop.label.trim().length > 0) {
        return stop.label.trim();
    }
    return String(stop.destination);
}

function secondsBetween(start: number): number {
    return (Date.now() - start) / 1000;
}

class TransportTracker {
    private client: Client;
    private definitions: CompiledTransportDefinition[];
    private currentJourney: JourneyState | null = null;
    private pendingCandidates = new Map<CompiledTransportDefinition, number[]>();
    private currentLocationId: number | null = null;
    private previousLocationId: number | null = null;
    private exitCommands: Set<string>;

    constructor(client: Client) {
        this.client = client;
        this.definitions = loadDefinitions();
        this.exitCommands = new Set(
            this.definitions
                .map(def => def.exitCommand)
                .filter((cmd): cmd is string => typeof cmd === "string" && cmd.length > 0)
        );
        this.registerTriggers();
        this.registerListeners();
        this.emitTimer(null);
    }

    private registerListeners() {
        this.client.addEventListener("command", (ev: CustomEvent<string>) => {
            this.handleCommand(ev.detail ?? "");
        });
        this.client.addEventListener("enterLocation", (ev: CustomEvent<{ id: number }>) => {
            const nextId = typeof ev.detail?.id === "number" ? ev.detail.id : null;
            const previous = this.currentLocationId;
            this.previousLocationId = previous;
            this.currentLocationId = nextId;
            if (this.currentJourney && !this.currentJourney.onBoard && previous !== null && nextId !== previous) {
                this.clearJourney();
            }
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
                this.client.Triggers.registerTrigger(definition.exitPattern, () => {
                    this.handleExit(definition);
                    return undefined;
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
            if (this.isMovementCommand(normalized)) {
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
            this.applyCandidateIndexes(this.currentJourney, candidateIndexes);
        } else if (!this.currentJourney && matches.size === 1) {
            const [definition, candidateIndexes] = matches.entries().next().value as [CompiledTransportDefinition, number[]];
            const journey = this.ensureJourney(definition);
            this.applyCandidateIndexes(journey, candidateIndexes);
        }
    }

    private handleEnter(definition: CompiledTransportDefinition) {
        const journey = this.ensureJourney(definition);
        const startId = this.previousLocationId ?? this.currentLocationId ?? null;
        if (typeof startId === "number") {
            const indexes = this.collectIndexes(definition, startId);
            if (indexes.length > 0) {
                this.applyCandidateIndexes(journey, indexes);
            }
        }
        if (journey.candidateIndexes.size === 0) {
            this.applyCandidateIndexes(journey, definition.stops.map((_, idx) => idx), false);
        }
        journey.onBoard = true;
        this.cancelExitTimeout(journey);
        this.pendingCandidates.delete(definition);
    }

    private handleExit(definition?: CompiledTransportDefinition) {
        if (definition && this.currentJourney && this.currentJourney.definition !== definition) {
            return;
        }
        this.markOutOfTransport();
    }

    private handleStart(definition: CompiledTransportDefinition) {
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
    }

    private handleSet(definition: CompiledTransportDefinition, index: number) {
        const journey = this.ensureJourney(definition);
        const stop = definition.stops[index];
        const indexes = this.collectIndexes(definition, stop.start);
        if (indexes.length > 0) {
            this.applyCandidateIndexes(journey, indexes, false);
        }
        journey.activeIndex = index;
        this.pendingCandidates.delete(definition);
        const startedAt = journey.startTimes.get(index);
        if (typeof startedAt === "number") {
            this.startCountdown(journey, index, startedAt);
        }
    }

    private handleStop(definition: CompiledTransportDefinition, index: number) {
        const journey = this.ensureJourney(definition);
        const stop = definition.stops[index];
        const startedAt = journey.startTimes.get(index);
        if (typeof startedAt === "number") {
            const elapsed = secondsBetween(startedAt);
            const expected = stop.time;
            const diff = expected - elapsed;
            if (diff > 0.1) {
                console.log(
                    `[Transport] Segment to ${formatLabel(stop)} finished ${diff.toFixed(2)}s earlier (expected ${expected.toFixed(2)}s, actual ${elapsed.toFixed(2)}s).`
                );
            }
        }
        this.stopCountdown();
        journey.startTimes.clear();
        journey.activeIndex = undefined;
        const nextIndex = (index + 1) % journey.definition.stops.length;
        this.applyCandidateIndexes(journey, [nextIndex]);
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
            for (const index of journey.candidateIndexes) {
                return index;
            }
        }
        return undefined;
    }

    private startCountdown(journey: JourneyState, index: number, startedAt: number) {
        const stop = journey.definition.stops[index];
        journey.activeIndex = index;
        journey.startTimes.set(index, startedAt);
        this.updateTimer(stop, startedAt);
        if (journey.timer) {
            clearInterval(journey.timer);
        }
        journey.timer = setInterval(() => {
            const currentStart = journey.startTimes.get(index);
            if (typeof currentStart !== "number") {
                return;
            }
            this.updateTimer(stop, currentStart);
        }, 500);
    }

    private updateTimer(stop: CompiledTransportStop, startedAt: number) {
        const elapsed = secondsBetween(startedAt);
        const remaining = Math.max(0, stop.time - elapsed);
        const payload: TransportTimerPayload = {
            label: formatLabel(stop),
            remaining,
            total: stop.time,
        };
        this.emitTimer(payload);
    }

    private stopCountdown() {
        if (this.currentJourney?.timer) {
            clearInterval(this.currentJourney.timer);
            this.currentJourney.timer = undefined;
        }
        this.emitTimer(null);
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
        }
        this.currentJourney = null;
        this.pendingCandidates.clear();
        this.emitTimer(null);
    }

    private emitTimer(payload: TransportTimerPayload | null) {
        this.client.sendEvent("transportTimer", payload);
    }
}

export default function initTransportStops(client: Client) {
    new TransportTracker(client);
}
