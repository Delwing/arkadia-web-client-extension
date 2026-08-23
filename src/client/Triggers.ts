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
    /**
     * Skip this trigger for lines that have already been suppressed.
     *
     * Suppression is a rendering decision, not a dispatch one: a gagged combat
     * line is still a hit, so counters and state machines must still see it. The
     * exception is a trigger that *routes* a line somewhere else — the combat
     * window — because "hide this everywhere" and "show it in the other window"
     * have to stay distinguishable. See docs/SCRIPT_DEPENDENCIES.md.
     */
    skipDeleted?: boolean;
}

export function isType(type: string): TriggerMatchFunction {
    const matches = [] as unknown as RegExpMatchArray;
    matches.index = 0
    return (_line, _matches, lineType) => {
        return lineType === type ? matches : undefined;
    };
}

export class Trigger {
    id = Math.random().toString(36).slice(2);
    children: Map<string, Trigger> = new Map();
    /**
     * Registry id of the script that registered this trigger, stamped by its
     * ScriptScope. Distinct from `tag`, which scripts choose freely and reuse to
     * clear parts of themselves — an owner is assigned, never picked.
     */
    owner?: string;
    private openInstances: number[] = [];

    constructor(
        private manager: Triggers,
        public pattern: TriggerPattern,
        public callback?: TriggerCallback,
        public tag?: string,
        public parent?: Trigger,
        private options: TriggerOptions = {}
    ) {
        this.owner = parent?.owner;
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

    execute(line: AnsiAwareBuffer, type: string, originalText?: string, plainLine?: string): AnsiAwareBuffer {
        // Opted out of suppressed lines — see TriggerOptions.skipDeleted.
        if (this.options.skipDeleted && line.deleted) {
            return line;
        }
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
                matches = pattern(line, null, type);
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
                const result = this.callback(line, matches, type, originalText ?? line.text);
                if (result === null) {
                    // Returning null means "do not render this line". It is sugar
                    // for markAsDeleted(): the line keeps travelling, so everything
                    // downstream still gets to see it.
                    line.markAsDeleted();
                } else if (result instanceof AnsiAwareBuffer) {
                    // Not a bare assignment: a rebuilt buffer starts empty of
                    // what earlier triggers decided about this line, the gag
                    // included. See AnsiAwareBuffer.replaceWith.
                    line = line.replaceWith(result);
                }
            }
            for (const child of this.children.values()) {
                line = child.execute(line, type, originalText, plainLine);
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

    private removeMatchingRecursive(matches: (trigger: Trigger) => boolean, collection: Map<string, Trigger>) {
        Array.from(collection.values()).forEach(trigger => {
            if (matches(trigger)) {
                this.removeTrigger(trigger);
            } else {
                this.removeMatchingRecursive(matches, trigger.children);
            }
        });
    }

    private removeMatching(matches: (trigger: Trigger) => boolean) {
        this.removeMatchingRecursive(matches, this.triggers);
        this.removeMatchingRecursive(matches, this.multilineTriggers);
        for (const [key, bucket] of Array.from(this.tokenTriggers.entries())) {
            const filtered = bucket.filter(t => !matches(t.trigger));
            if (filtered.length === 0) {
                this.tokenTriggers.delete(key);
            } else if (filtered.length !== bucket.length) {
                this.tokenTriggers.set(key, filtered);
            }
        }
    }

    registerTrigger(pattern: TriggerPattern, callback?: TriggerCallback, tag?: string, options?: TriggerOptions) {
        const trigger = new Trigger(this, pattern, callback, tag, undefined, options);
        this.triggers.set(trigger.id, trigger);
        return trigger;
    }

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
        this.removeMatching(trigger => trigger.tag === tag);
    }

    /**
     * Drop every trigger a given script registered. The teardown half of making a
     * script toggleable; see ScriptScope.
     */
    removeByOwner(owner: string) {
        this.removeMatching(trigger => trigger.owner === owner);
    }

    /**
     * How many triggers a given script has registered, children included.
     *
     * Read-only counterpart to removeByOwner, for showing what a feature is
     * currently doing to the output without exposing the trigger tree itself.
     */
    countByOwner(owner: string): number {
        let count = 0;
        const walk = (triggers: Iterable<Trigger>) => {
            for (const trigger of triggers) {
                if (trigger.owner === owner) count++;
                walk(trigger.children.values());
            }
        };
        walk(this.triggers.values());
        walk(this.multilineTriggers.values());
        // Token triggers live in per-word buckets and one trigger can sit in
        // several, so count identities rather than entries.
        const seen = new Set<string>();
        for (const bucket of this.tokenTriggers.values()) {
            for (const {trigger} of bucket) {
                if (trigger.owner === owner && !seen.has(trigger.id)) {
                    seen.add(trigger.id);
                    count++;
                }
            }
        }
        return count;
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
        // Preserve original text for pattern matching
        const originalText = line.text;
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

        // Snapshot: a trigger registered *while* this line is being dispatched —
        // a one-time follow-up trigger, say — must not also fire on the line that
        // registered it. Map iteration would otherwise visit it in this same pass.
        for (const trigger of Array.from(this.triggers.values())) {
            line = trigger.execute(line, type, originalText, plain);
        }

        if (this.tokenTriggers.size > 0) {
            const seen = new Set<string>();
            const zeroBucket = this.tokenTriggers.get(Triggers.ZERO_LENGTH_BUCKET_KEY);
            if (zeroBucket) {
                for (const {trigger} of zeroBucket) {
                    if (!seen.has(trigger.id)) {
                        seen.add(trigger.id);
                        line = trigger.execute(line, type, originalText, plain);
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
                            line = trigger.execute(line, type, originalText, plain);
                        }
                    }
                }
            }
        }
        // Suppression is decided once, here, after every trigger has had its say.
        return line.deleted ? null : line;
    }

    parseMultiline(line: AnsiAwareBuffer, type: string): AnsiAwareBuffer | null {
        // Preserve original text for pattern matching
        const originalText = line.text;
        const plain = originalText.replace(/\s$/g, "");
        for (const trigger of this.multilineTriggers.values()) {
            line = trigger.execute(line, type, originalText, plain);
        }
        return line.deleted ? null : line;
    }

}
