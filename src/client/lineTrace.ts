import type {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

/** Which trigger pass ran a step: multiline sees the whole group, the others one line. */
export type LineTracePass = 'multiline' | 'line' | 'token';

/**
 * What a matched trigger did to the line. 'kept' still matters: a trigger that
 * matched and left the line alone is the answer to "why did my trigger not run"
 * being "it did".
 */
export type LineTraceOutcome = 'kept' | 'changed' | 'deleted';

export interface LineTraceStep {
    /** Tag plus pattern(s), as Trigger.describe() gives it. */
    trigger: string;
    tag?: string;
    pass: LineTracePass;
    /** Ran as a child of another matched trigger. */
    child: boolean;
    outcome: LineTraceOutcome;
    /** The line before and after this trigger, as HTML; only for 'changed'. */
    beforeHtml?: string;
    afterHtml?: string;
    /** Callback time in ms. */
    ms: number;
}

export interface LineTraceEntry {
    id: number;
    at: number;
    /** GMCP message type ('' when none). */
    type: string;
    /** Text as the MUD sent it, before any trigger; may hold several lines. */
    raw: string;
    rawHtml: string;
    /** What reached the output; null when a trigger removed it. */
    final: string | null;
    finalHtml: string | null;
    steps: LineTraceStep[];
}

export interface TraceableTrigger {
    describe(): string;
    tag?: string;
    parent?: unknown;
}

/**
 * Records what the trigger pipeline did to each line while something (the line
 * inspector window) is listening. Triggers holds a recorder only while one is
 * wanted, so with nobody listening the cost is a null check per matched trigger.
 *
 * Lines can nest: a callback may print, and printing can run the pipeline again.
 * Steps go to the innermost open line.
 */
export class LineTraceRecorder {
    private static nextId = 1;
    private open: LineTraceEntry[] = [];
    pass: LineTracePass = 'line';

    constructor(private readonly onEntry: (entry: LineTraceEntry) => void) {}

    begin(buffer: AnsiAwareBuffer, type: string): void {
        // The MUD's line ending is not part of the line; what reaches the output never has it.
        const ending = /\r?\n$/.exec(buffer.text);
        const raw = ending ? buffer.clone().remove([ending.index, buffer.length]) : buffer;
        this.open.push({
            id: LineTraceRecorder.nextId++,
            at: Date.now(),
            type,
            raw: raw.text,
            rawHtml: raw.toHtml(),
            final: null,
            finalHtml: null,
            steps: [],
        });
    }

    end(result: AnsiAwareBuffer | null): void {
        const entry = this.open.pop();
        if (!entry) return;
        if (result && !result.deleted) {
            entry.final = result.text;
            entry.finalHtml = result.toHtml();
        }
        this.onEntry(entry);
    }

    /**
     * Wraps one trigger callback. `before` is captured before the callback runs
     * because callbacks edit the buffer in place and usually return it.
     */
    run(
        trigger: TraceableTrigger,
        line: AnsiAwareBuffer,
        callback: () => AnsiAwareBuffer | null | undefined,
    ): AnsiAwareBuffer | null | undefined {
        const entry = this.open[this.open.length - 1];
        if (!entry) return callback();
        const beforeHtml = line.toHtml();
        const startedAt = performance.now();
        let result: AnsiAwareBuffer | null | undefined;
        try {
            result = callback();
        } finally {
            const ms = performance.now() - startedAt;
            const after = result === undefined ? line : result;
            let outcome: LineTraceOutcome;
            let afterHtml: string | undefined;
            if (after === null || after.deleted) {
                outcome = 'deleted';
            } else {
                afterHtml = after.toHtml();
                outcome = afterHtml === beforeHtml ? 'kept' : 'changed';
            }
            entry.steps.push({
                trigger: trigger.describe(),
                tag: trigger.tag,
                pass: this.pass,
                child: trigger.parent !== undefined,
                outcome,
                ...(outcome === 'changed' ? {beforeHtml, afterHtml} : {}),
                ms,
            });
        }
        return result;
    }

    /** A trigger that matched with nothing to run (a parent that only gates children). */
    matched(trigger: TraceableTrigger): void {
        const entry = this.open[this.open.length - 1];
        if (!entry) return;
        entry.steps.push({
            trigger: trigger.describe(),
            tag: trigger.tag,
            pass: this.pass,
            child: trigger.parent !== undefined,
            outcome: 'kept',
            ms: 0,
        });
    }
}
