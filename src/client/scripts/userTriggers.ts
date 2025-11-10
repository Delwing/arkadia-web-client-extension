import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {TextRange} from "../ansi/FormatState";

export interface UserMacro {
    type: 'uppercase' | 'color' | 'replace' | 'beep' | 'command' | 'slowBlink' | 'rapidBlink';
    color?: string;
    to?: string;
    command?: string;
    soundKey?: string;
}

export interface UserTrigger {
    pattern: string;
    macros: UserMacro[];
}

const STORAGE_KEY = 'triggers';

export default function initUserTriggers(client: Client) {
    let registered: import("../Triggers").Trigger[] = [];

    const apply = (list: UserTrigger[] = []) => {
        registered.forEach(t => client.Triggers.removeTrigger(t));
        registered = [];
        list.forEach(item => {
            let regexp: RegExp;
            try {
                regexp = new RegExp(item.pattern);
            } catch (e) {
                console.error('Invalid trigger pattern', item.pattern, e);
                return;
            }
            const trigger = client.Triggers.registerTrigger(regexp, (line, matches) => {
                let matchRange: TextRange = [line.text.indexOf(matches[0]), line.text.indexOf(matches[0]) + matches[0].length];
                item.macros?.forEach(macro => {
                    switch (macro.type) {
                        case 'uppercase':
                            line.replace(matchRange, line.text.substring(matchRange[0], matchRange[1]).toUpperCase());
                            break;
                        case 'color':
                            if (macro.color) {
                                const color = createColorFormat(macro.color);
                                line.applyFormat(matchRange, color)
                            }
                            break;
                        case 'replace':
                            const replacement = macro.to || '';
                            line.replace(matchRange, replacement);
                            matchRange = [line.text.indexOf(replacement), line.text.indexOf(replacement) + replacement.length];
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
                    }
                });
                return line
            }, STORAGE_KEY);
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
