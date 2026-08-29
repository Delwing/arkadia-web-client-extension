import Client from "./Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

export type TriggerCallback = (
    line: AnsiAwareBuffer,
    matches: RegExpMatchArray,
    type: string, //TODO I guess we can try to list values
    originalLine: string,
) => AnsiAwareBuffer | null;

export type TriggerMatchFunction = (
    line: AnsiAwareBuffer,
    matches: RegExpMatchArray,
    type: string
) => RegExpMatchArray | undefined;

export type TriggerSubPattern = string | RegExp | TriggerMatchFunction;
export type TriggerPattern = TriggerSubPattern | TriggerSubPattern[];

export interface TriggerOptions {
    stayOpenLines?: number;
    caseInsensitive?: boolean;
}

export function isType(type: string): TriggerMatchFunction {
    const matches = [] as unknown as RegExpMatchArray;
    matches.index = 0
    return (_line, _matches, lineType) => {
        return lineType === type ? matches : undefined;
    };
}

export class Trigger {
    /** How many faults to report per trigger before going quiet about it. */
    private static readonly MAX_REPORTED_FAULTS = 3;

    id = Math.random().toString(36).slice(2);
    children: Map<string, Trigger> = new Map();
    private openInstances: number[] = [];
    private faultCount = 0;

    constructor(
        private manager: Triggers,
        public pattern: TriggerPattern,
        public callback?: TriggerCallback,
        public tag?: string,
        public parent?: Trigger,
        private options: TriggerOptions = {}
    ) {
        if (options.caseInsensitive) {
            this.pattern = this.precompileCaseInsensitive(pattern);
        }
    }

    private precompileCaseInsensitive(pattern: TriggerPattern): TriggerPattern {
        const compile = (p: TriggerSubPattern): TriggerSubPattern => {
            if (p instanceof RegExp && !p.flags.includes('i')) {
                return new RegExp(p.source, p.flags + 'i');
            }
            return p;
        };
        if (Array.isArray(pattern)) {
            return pattern.map(compile);
        }
        return compile(pattern);
    }

    registerChild(
        pattern: TriggerPattern,
        callback?: TriggerCallback,
        tag?: string,
        options?: TriggerOptions
    ) {
        const child = new Trigger(this.manager, pattern, callback, tag, this, options);
        this.children.set(child.id, child);
        return child;
    }

    registerOneTimeChild(
        pattern: TriggerPattern,
        callback: TriggerCallback,
        tag?: string,
        options?: TriggerOptions
    ) {
        const child = this.registerChild(
            pattern,
            (line, matches, type, originalLine) => {
                this.manager.removeTrigger(child);
                return callback(line, matches, type, originalLine);
            },
            tag,
            options
        );
        return child;
    }

    /** Human-readable identity for fault logs: the tag if there is one, plus the pattern(s). */
    private describe(): string {
        const patterns = Array.isArray(this.pattern) ? this.pattern : [this.pattern];
        const source = patterns
            .map(p => p instanceof RegExp ? p.source : typeof p === "function" ? "<match fn>" : String(p))
            .join(" | ");
        return this.tag ? `${this.tag} (${source})` : source;
    }

    /**
     * A trigger that throws is a bug in that trigger, not a reason to drop the line —
     * but a trigger that throws on *every* line would drown the console, and user
     * triggers and plugins both run arbitrary code here. Report the first few faults
     * in full, then say once that the rest are suppressed.
     */
    private reportFault(stage: string, err: unknown): void {
        this.faultCount++;
        if (this.faultCount <= Trigger.MAX_REPORTED_FAULTS) {
            console.error(`[Triggers] ${stage} threw in trigger ${this.describe()}`, err);
        } else if (this.faultCount === Trigger.MAX_REPORTED_FAULTS + 1) {
            console.error(`[Triggers] suppressing further faults from trigger ${this.describe()}`);
        }
    }

    execute(line: AnsiAwareBuffer, type: string, originalText?: string, plainLine?: string): AnsiAwareBuffer | null {
        // Use pre-trimmed plainLine if provided, otherwise compute from originalText/line.text
        if (plainLine === undefined) {
            plainLine = (originalText ?? line.text).replace(/\s$/g, "");
        }
        this.openInstances = this.openInstances.map(v => v - 1).filter(v => v > 0);
        let matches: RegExpMatchArray | undefined;
        const patterns = Array.isArray(this.pattern) ? this.pattern : [this.pattern];
        for (const pattern of patterns) {
            if (pattern instanceof RegExp) {
                matches = plainLine.match(pattern);
            } else if (typeof pattern === "string") {
                const patternStr = pattern.toString();
                const haystack = !this.options.caseInsensitive ? plainLine : plainLine.toLowerCase();
                const needle = !this.options.caseInsensitive ? patternStr : patternStr.toLowerCase();
                const index = haystack.indexOf(needle);
                if (index > -1) {
                    const end = index + patternStr.length;
                    const matchedText = plainLine.substring(index, end);
                    matches = [matchedText] as RegExpMatchArray;
                    matches.index = index;
                    matches.input = plainLine;
                }
            } else if (typeof pattern === "function") {
                try {
                    matches = pattern(line, null, type);
                } catch (err) {
                    // A match function that throws decides nothing: treat it as no match
                    // and let the remaining patterns (and triggers) have their say.
                    this.reportFault("match function", err);
                    matches = undefined;
                }
            }
            if (matches) {
                break;
            }
        }
        let matched = patterns.length == 0;
        if (matches) {
            matched = true;
            if (this.options.stayOpenLines && this.options.stayOpenLines > 0) {
                this.openInstances.push(this.options.stayOpenLines + 1);
            }
        } else if (this.openInstances.length > 0) {
            matched = true;
        }
        if (matched) {
            if (matches && this.callback) {
                let result: AnsiAwareBuffer | null | undefined;
                try {
                    result = this.callback(line, matches, type, originalText ?? line.text);
                } catch (err) {
                    // A throwing callback costs its own effect and nothing more: the buffer
                    // travels on as the callback left it, this trigger's children still run,
                    // and every later trigger still sees the line.
                    this.reportFault("callback", err);
                    result = undefined;
                }
                if (result === null) {
                    return null;
                }
                if (result instanceof AnsiAwareBuffer) {
                    line = result;
                }
            }
            for (const child of this.children.values()) {
                const childResult = child.execute(line, type, originalText, plainLine);
                if (childResult === null) {
                    return null;
                }
                line = childResult;
            }
        }
        return line;
    }
}

export default class Triggers {

    client: Client;
    triggers: Map<string, Trigger> = new Map();
    multilineTriggers: Map<string, Trigger> = new Map();
    private static readonly ZERO_LENGTH_BUCKET_KEY = Symbol("zero-length-token-trigger");

    private tokenTriggers: Map<string | symbol, { words: string[]; trigger: Trigger }[]> = new Map();

    constructor(client: Client) {
        this.client = client;
    }

    private removeByTagRecursive(tag: string, collection: Map<string, Trigger>) {
        Array.from(collection.values()).forEach(trigger => {
            if (trigger.tag === tag) {
                this.removeTrigger(trigger);
            } else {
                this.removeByTagRecursive(tag, trigger.children);
            }
        });
    }

    registerTrigger(pattern: TriggerPattern, callback?: TriggerCallback, tag?: string, options?: TriggerOptions) {
        const trigger = new Trigger(this, pattern, callback, tag, undefined, options);
        this.triggers.set(trigger.id, trigger);
        return trigger;
    }

    /**
     * Registers a trigger matched against a whole received frame instead of a single line,
     * so a pattern can span newlines.
     *
     * A frame is whatever the game flushed in one go, *not* one logical message — a `kto`
     * reply and a carriage moving off can arrive together. So an open-ended tail capture
     * (`([\s\S]+)$`, a greedy wildcard with nothing required after it) may hold trailing
     * lines that belong to something else. That is fine as long as the callback expects it:
     * decide where the message ends before you parse, decorate or drop what you captured.
     * Either the pattern can settle it (PackageHelper ends on the `Symbolem \* oznaczono...`
     * terminator the message must contain) or the callback can (whoCount's `sliceKtoBody`
     * cuts the body at the first line with a period, which no kto line ever has). What does
     * not work is treating the whole capture as message content by default — a callback that
     * reprocesses all of `line.text` rather than what it matched has the same problem
     * without the regex.
     *
     * Text a multiline callback inserts does not disturb single-line matching: Client.onLine
     * carries the pristine per-line text into the per-line pass.
     */
    registerMultilineTrigger(pattern: TriggerPattern, callback?: TriggerCallback, tag?: string, options?: TriggerOptions) {
        const trigger = new Trigger(this, pattern, callback, tag, undefined, options);
        this.multilineTriggers.set(trigger.id, trigger);
        return trigger;
    }

    registerOneTimeTrigger(pattern: TriggerPattern, callback: TriggerCallback, tag?: string, options?: TriggerOptions) {
        const trigger = this.registerTrigger(
            pattern,
            (line, matches, type, originalLine) => {
                this.removeTrigger(trigger);
                return callback(line, matches, type, originalLine);
            },
            tag,
            options
        );
        return trigger;
    }

    registerTokenTrigger(token: string, callback?: TriggerCallback, tag?: string, options?: TriggerOptions) {
        const words = token
            .toLowerCase()
            .split(/[ \n\t.,!?*()\/\[\]]+/)
            .filter(w => w.length > 0);
        const trigger = new Trigger(this, token, callback, tag, undefined, options);
        const bucketKey = words[0] ?? Triggers.ZERO_LENGTH_BUCKET_KEY;
        const bucket = this.tokenTriggers.get(bucketKey) ?? [];
        bucket.push({words, trigger});
        this.tokenTriggers.set(bucketKey, bucket);
        return trigger;
    }

    /** As {@link registerMultilineTrigger} — including what it says about open-ended tail captures — but removed after it first fires. */
    registerOneTimeMultilineTrigger(pattern: TriggerPattern, callback: TriggerCallback, tag?: string, options?: TriggerOptions) {
        const trigger = this.registerMultilineTrigger(
            pattern,
            (line, matches, type, originalLine) => {
                this.removeTrigger(trigger);
                return callback(line, matches, type, originalLine);
            },
            tag,
            options
        );
        return trigger;
    }

    removeByTag(tag: string) {
        this.removeByTagRecursive(tag, this.triggers);
        this.removeByTagRecursive(tag, this.multilineTriggers);
        for (const [key, bucket] of Array.from(this.tokenTriggers.entries())) {
            const filtered = bucket.filter(t => t.trigger.tag !== tag);
            if (filtered.length === 0) {
                this.tokenTriggers.delete(key);
            } else if (filtered.length !== bucket.length) {
                this.tokenTriggers.set(key, filtered);
            }
        }
    }

    removeTrigger(trigger: Trigger) {
        if (trigger.parent) {
            trigger.parent.children.delete(trigger.id);
        } else {
            this.triggers.delete(trigger.id);
            this.multilineTriggers.delete(trigger.id);
        }
        for (const [key, bucket] of Array.from(this.tokenTriggers.entries())) {
            const filtered = bucket.filter(t => t.trigger.id !== trigger.id);
            if (filtered.length === 0) {
                this.tokenTriggers.delete(key);
            } else if (filtered.length !== bucket.length) {
                this.tokenTriggers.set(key, filtered);
            }
        }
    }

    parseLine(line: AnsiAwareBuffer, type: string): AnsiAwareBuffer | null {
        // Every trigger in this pass matches the line as the MUD sent it, never as an
        // earlier trigger left it. `originalText` carries the pristine text across the
        // multiline pass (set by Client.onLine); `line.text` is the fallback for buffers
        // that never went through it.
        const originalText = line.originalText ?? line.text;
        const plain = originalText.replace(/\s$/g, "");
        let tokens: string[] | undefined;
        const getTokens = () => {
            if (!tokens) {
                tokens = plain
                    .split(/[ \n\t.,!?*()\/\[\]]+/)
                    .filter(t => t.length > 0)
                    .map(t => t.toLowerCase());
            }
            return tokens!;
        };

        for (const trigger of this.triggers.values()) {
            const result = trigger.execute(line, type, originalText, plain);
            if (result === null) {
                return null;
            }
            line = result;
            // If line was marked as deleted, return null to omit from output
            if (line.deleted) {
                return null;
            }
        }

        if (this.tokenTriggers.size > 0) {
            const seen = new Set<string>();
            const zeroBucket = this.tokenTriggers.get(Triggers.ZERO_LENGTH_BUCKET_KEY);
            if (zeroBucket) {
                for (const {trigger} of zeroBucket) {
                    if (!seen.has(trigger.id)) {
                        seen.add(trigger.id);
                        const result = trigger.execute(line, type, originalText, plain);
                        if (result === null) {
                            return null;
                        }
                        line = result;
                        // If line was marked as deleted, return null to omit from output
                        if (line.deleted) {
                            return null;
                        }
                    }
                }
            }
            const hasOtherBuckets = this.tokenTriggers.size > (zeroBucket ? 1 : 0);
            if (hasOtherBuckets) {
                const loweredTokens = getTokens();
                for (let i = 0; i < loweredTokens.length; i++) {
                    const token = loweredTokens[i];
                    const bucket = this.tokenTriggers.get(token);
                    if (!bucket) {
                        continue;
                    }
                    for (const {words, trigger} of bucket) {
                        if (seen.has(trigger.id) || words.length === 0 || words[0] !== token) {
                            continue;
                        }
                        if (words.length > loweredTokens.length - i) {
                            continue;
                        }
                        let matches = true;
                        for (let j = 1; j < words.length; j++) {
                            if (loweredTokens[i + j] !== words[j]) {
                                matches = false;
                                break;
                            }
                        }
                        if (matches) {
                            seen.add(trigger.id);
                            const result = trigger.execute(line, type, originalText, plain);
                            if (result === null) {
                                return null;
                            }
                            line = result;
                            // If line was marked as deleted, return null to omit from output
                            if (line.deleted) {
                                return null;
                            }
                        }
                    }
                }
            }
        }
        return line
    }

    parseMultiline(line: AnsiAwareBuffer, type: string): AnsiAwareBuffer | null {
        // Preserve original text for pattern matching
        const originalText = line.text;
        const plain = originalText.replace(/\s$/g, "");
        for (const trigger of this.multilineTriggers.values()) {
            const result = trigger.execute(line, type, originalText, plain);
            if (result === null) {
                return null;
            }
            line = result;
            // If line was marked as deleted, return null to omit from output
            if (line.deleted) {
                return null;
            }
        }
        return line
    }

}
