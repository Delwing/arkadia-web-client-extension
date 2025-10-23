import Client from "./Client";
import { stripAnsiCodes } from "./stripAnsiCodes";
import TriggerLine from "./triggers/TriggerLine";
export { stripAnsiCodes };

type TriggerCallback = (
    rawLine: string,
    line: string,
    matches: RegExpMatchArray,
    type: string,
    triggerLine?: TriggerLine,
) => string | TriggerLine | undefined;

type TriggerMatchFunction = (
    rawLine: string,
    line: string,
    _matches: RegExpMatchArray | undefined,
    type: string,
    triggerLine?: TriggerLine,
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
    return (_raw, _line, _matches, _type) => {
        return _type === type ? matches : undefined;
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
    ) {}

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
            (rawLine, line, matches, type, triggerLine) => {
                this.manager.removeTrigger(child);
                return callback(rawLine, line, matches, type, triggerLine);
            },
            tag,
            options
        );
        return child;
    }

    execute(line: TriggerLine, type: string) {
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
                matches = pattern(line.toAnsiString(), plainLine, undefined, type, line);
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
        if (!matches) {
            line.clearMatches();
        }
        if (matched) {
            if (matches && this.callback) {
                line.setMatches({ matches, type, triggerId: this.id });
                const result = this.callback(
                    line.toAnsiString(),
                    plainLine,
                    matches,
                    type,
                    line,
                );
                if (this.manager.isTriggerEngineActive()) {
                    if (result instanceof TriggerLine) {
                        line = result;
                    } else if (typeof result === "string") {
                        line = new TriggerLine(result, line.matches, this.manager.isTriggerEngineActive());
                        line.setOverrideAnsi(result);
                    }
                }
            }
            this.children.forEach(child => {
                line = child.execute(line, type);
            });
        }
        return line;
    }
}

export default class Triggers {

    clientExtension: Client;
    triggers: Map<string, Trigger> = new Map();
    multilineTriggers: Map<string, Trigger> = new Map();
    private tokenTriggers: { words: string[]; trigger: Trigger }[] = [];
    private triggerEngineActive = true;

    constructor(clientExtension: Client) {
        this.clientExtension = clientExtension;
    }

    isTriggerEngineActive(): boolean {
        return this.triggerEngineActive;
    }

    setTriggerEngineActive(active: boolean) {
        this.triggerEngineActive = active;
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
            (rawLine, line, matches, type, triggerLine) => {
                this.removeTrigger(trigger);
                return callback(rawLine, line, matches, type, triggerLine);
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
        this.tokenTriggers.push({ words, trigger });
        return trigger;
    }

    registerOneTimeMultilineTrigger(pattern: TriggerPattern, callback: TriggerCallback, tag?: string, options?: TriggerOptions) {
        const trigger = this.registerMultilineTrigger(
            pattern,
            (rawLine, line, matches, type, triggerLine) => {
                this.removeTrigger(trigger);
                return callback(rawLine, line, matches, type, triggerLine);
            },
            tag,
            options
        );
        return trigger;
    }

    removeByTag(tag: string) {
        this.removeByTagRecursive(tag, this.triggers);
        this.removeByTagRecursive(tag, this.multilineTriggers);
        this.tokenTriggers = this.tokenTriggers.filter(t => t.trigger.tag !== tag);
    }

    removeTrigger(trigger: Trigger) {
        if (trigger.parent) {
            trigger.parent.children.delete(trigger.id);
        } else {
            this.triggers.delete(trigger.id);
            this.multilineTriggers.delete(trigger.id);
            this.tokenTriggers = this.tokenTriggers.filter(t => t.trigger.id !== trigger.id);
        }
    }

    parseLine(rawLine: string, type: string) {
        let triggerLine = new TriggerLine(rawLine, { type }, this.triggerEngineActive);
        const plain = stripAnsiCodes(triggerLine.text).replace(/\s$/g, "");
        const tokens = plain
            .split(/[ \n\t.,!?*()\/\[\]]+/)
            .filter(t => t.length > 0)
            .map(t => t.toLowerCase());

        this.triggers.forEach(trigger => {
            triggerLine = trigger.execute(triggerLine, type);
        });

        this.tokenTriggers.forEach(({ words, trigger }) => {
            for (let i = 0; i <= tokens.length - words.length; i++) {
                let found = true;
                for (let j = 0; j < words.length; j++) {
                    if (tokens[i + j] !== words[j]) {
                        found = false;
                        break;
                    }
                }
                if (found) {
                    triggerLine = trigger.execute(triggerLine, type);
                    break;
                }
            }
        });
        return triggerLine.toAnsiString();
    }

    parseMultiline(rawLine: string, type: string) {
        let triggerLine = new TriggerLine(rawLine, { type }, this.triggerEngineActive);
        this.multilineTriggers.forEach(trigger => {
            triggerLine = trigger.execute(triggerLine, type);
        });
        return triggerLine.toAnsiString();
    }

}
