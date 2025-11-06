import Client from "./Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

type TriggerCallback = (
    line: AnsiAwareBuffer,
    matches: RegExpMatchArray,
    type: string, //TODO I guess we can try to list values
) => AnsiAwareBuffer | null;

type TriggerMatchFunction = (
    line: AnsiAwareBuffer,
    matches: RegExpMatchArray,
    type: string
) => RegExpMatchArray | undefined;

type TriggerSubPattern = string | RegExp | TriggerMatchFunction;
type TriggerPattern = TriggerSubPattern | TriggerSubPattern[];

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
    id = Math.random().toString(36).slice(2);
    children: Map<string, Trigger> = new Map();
    private openInstances: number[] = [];

    constructor(
        private manager: Triggers,
        public pattern: TriggerPattern,
        public callback?: TriggerCallback,
        public tag?: string,
        public parent?: Trigger,
        private options: TriggerOptions = {}
    ) {
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
            (line, matches, type) => {
                this.manager.removeTrigger(child);
                return callback(line, matches, type);
            },
            tag,
            options
        );
        return child;
    }

    execute(line: AnsiAwareBuffer, type: string): AnsiAwareBuffer | null {
        const plainLine = line.text.replace(/\s$/g, "");
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
                const result = this.callback(line, matches, type);
                if (result === null) {
                    return null;
                }
                if (result instanceof AnsiAwareBuffer) {
                    line = result;
                }
            }
            for (const child of this.children.values()) {
                const childResult = child.execute(line, type);
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

    registerMultilineTrigger(pattern: TriggerPattern, callback?: TriggerCallback, tag?: string, options?: TriggerOptions) {
        const trigger = new Trigger(this, pattern, callback, tag, undefined, options);
        this.multilineTriggers.set(trigger.id, trigger);
        return trigger;
    }

    registerOneTimeTrigger(pattern: TriggerPattern, callback: TriggerCallback, tag?: string, options?: TriggerOptions) {
        const trigger = this.registerTrigger(
            pattern,
            (line, matches, type) => {
                this.removeTrigger(trigger);
                return callback(line, matches, type);
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
            (line, matches, type) => {
                this.removeTrigger(trigger);
                return callback(line, matches, type);
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
        const plain = line.text.replace(/\s$/g, "");
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
            const result = trigger.execute(line, type);
            if (result === null) {
                return null;
            }
            line = result;
        }

        if (this.tokenTriggers.size > 0) {
            const seen = new Set<string>();
            const zeroBucket = this.tokenTriggers.get(Triggers.ZERO_LENGTH_BUCKET_KEY);
            if (zeroBucket) {
                for (const {trigger} of zeroBucket) {
                    if (!seen.has(trigger.id)) {
                        seen.add(trigger.id);
                        const result = trigger.execute(line, type);
                        if (result === null) {
                            return null;
                        }
                        line = result;
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
                            const result = trigger.execute(line, type);
                            if (result === null) {
                                return null;
                            }
                            line = result;
                        }
                    }
                }
            }
        }
        return line
    }

    parseMultiline(line: AnsiAwareBuffer, type: string): AnsiAwareBuffer | null {
        for (const trigger of this.multilineTriggers.values()) {
            const result = trigger.execute(line, type);
            if (result === null) {
                return null;
            }
            line = result;
        }
        return line
    }

}
