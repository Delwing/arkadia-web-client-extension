import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer, TextRange} from "@client/ansi/FormatState";
import {Trigger} from "../Triggers";

export interface UserMacro {
    type: 'uppercase' | 'color' | 'replace' | 'beep' | 'command' | 'slowBlink' | 'rapidBlink' | 'functionalBind';
    color?: string;
    to?: string;
    command?: string;
    soundKey?: string;
    label?: string;
}

export interface UserTrigger {
    pattern: string;
    flags?: string;
    macros: UserMacro[];
}

const STORAGE_KEY = 'triggers';

function applyMacrosToMatch(
    client: Client,
    line: AnsiAwareBuffer,
    match: RegExpMatchArray,
    macros: UserMacro[]
): void {
    const matchStart = match.index ?? 0;
    let matchRange: TextRange = [matchStart, matchStart + match[0].length];

    macros?.forEach(macro => {
        switch (macro.type) {
            case 'uppercase':
                line.replace(matchRange, line.text.substring(matchRange[0], matchRange[1]).toUpperCase());
                break;
            case 'color':
                if (macro.color) {
                    const color = createColorFormat(macro.color);
                    line.applyFormat(matchRange, color);
                }
                break;
            case 'replace':
                const replacement = macro.to || '';
                line.replace(matchRange, replacement);
                matchRange = [matchRange[0], matchRange[0] + replacement.length];
                break;
            case 'beep':
                client.sendEvent("sound:play", {key: macro.soundKey || "beep"});
                break;
            case 'command':
                if (macro.command) {
                    client.sendCommand(macro.command);
                }
                break;
            case 'slowBlink':
                line.applyFormat(matchRange, { slowBlink: true });
                break;
            case 'rapidBlink':
                line.applyFormat(matchRange, { rapidBlink: true });
                break;
            case 'functionalBind':
                if (macro.command && macro.label) {
                    client.FunctionalBind.set(macro.label, () => {
                        client.sendCommand(macro.command!);
                    });
                }
                break;
        }
    });
}

export default function initUserTriggers(client: Client) {
    let registered: Trigger[] = [];

    const apply = (list: UserTrigger[] = []) => {
        registered.forEach(t => client.Triggers.removeTrigger(t));
        registered = [];
        list.forEach(item => {
            const flags = item.flags || '';
            const hasGlobalFlag = flags.includes('g');
            const hasCaseInsensitiveFlag = flags.includes('i');
            const hasMultilineFlag = flags.includes('m');

            // Build regexp flags without 'i' (handled by TriggerOptions) and without 'm' (handled by trigger type)
            const regexpFlags = hasGlobalFlag ? 'g' : '';

            let regexp: RegExp;
            try {
                regexp = new RegExp(item.pattern, regexpFlags);
            } catch (e) {
                console.error('Invalid trigger pattern', item.pattern, item.flags, e);
                return;
            }

            const callback = (line: AnsiAwareBuffer, matches: RegExpMatchArray) => {
                if (hasGlobalFlag) {
                    // For global flag, find all matches and apply macros to each
                    const globalRegexp = new RegExp(item.pattern, 'g' + (hasCaseInsensitiveFlag ? 'i' : ''));
                    let match: RegExpExecArray | null;
                    const allMatches: RegExpExecArray[] = [];

                    while ((match = globalRegexp.exec(line.text)) !== null) {
                        allMatches.push(match);
                        if (match[0].length === 0) {
                            globalRegexp.lastIndex++;
                        }
                    }

                    // Apply in reverse order to preserve indices
                    for (let i = allMatches.length - 1; i >= 0; i--) {
                        applyMacrosToMatch(client, line, allMatches[i], item.macros);
                    }
                } else {
                    applyMacrosToMatch(client, line, matches, item.macros);
                }
                return line;
            };

            const trigger = hasMultilineFlag
                ? client.Triggers.registerMultilineTrigger(regexp, callback, STORAGE_KEY, { caseInsensitive: hasCaseInsensitiveFlag })
                : client.Triggers.registerTrigger(regexp, callback, STORAGE_KEY, { caseInsensitive: hasCaseInsensitiveFlag });

            registered.push(trigger);
        });
    };

    client.on('storage', ({key, value}) => {
        if (key === STORAGE_KEY) {
            apply(Array.isArray(value) ? value : []);
        }
    });

    client.on('port-connected', () => {
        client.port?.postMessage({type: 'GET_STORAGE', key: STORAGE_KEY});
    });

    client.port?.postMessage({type: 'GET_STORAGE', key: STORAGE_KEY});
}
