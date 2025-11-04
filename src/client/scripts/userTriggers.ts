import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";

function toUpperSafe(text: string) {
    return text.split(/(\x1B\[[0-9;]*m)/g).map((seg, i) => i % 2 === 0 ? seg.toUpperCase() : seg).join('');
}

export interface UserMacro {
    type: 'uppercase' | 'color' | 'replace' | 'beep' | 'command';
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
            const trigger = client.Triggers.registerTrigger(regexp, (triggerLine) => {
                const matches = triggerLine.matches.matches;
                if (!matches) return triggerLine;
                const raw = triggerLine.toAnsiString();
                const r = new RegExp(regexp.source, regexp.flags.includes('g') ? regexp.flags : regexp.flags + 'g');
                const result = raw.replace(r, (match) => {
                    let replaced = match;
                    item.macros?.forEach(m => {
                        switch (m.type) {
                            case 'uppercase':
                                replaced = toUpperSafe(replaced);
                                break;
                            case 'color':
                                if (m.color) {
                                    const code = findClosestColor(m.color);
                                    replaced = colorString(replaced, code);
                                }
                                break;
                            case 'replace':
                                replaced = m.to || '';
                                break;
                            case 'beep':
                                client.sendEvent("sound:play", { key: m.soundKey || "beep" });
                                break;
                            case 'command':
                                if (m.command) {
                                    client.sendCommand(m.command);
                                }
                                break;
                        }
                    });
                    return replaced;
                });
                triggerLine.setOverrideAnsi(result);
                return triggerLine;
            }, STORAGE_KEY);
            registered.push(trigger);
        });
    };

    client.on('storage', ({ key, value }) => {
        if (key === STORAGE_KEY) {
            apply(Array.isArray(value) ? value : []);
        }
    });

    client.on('port-connected', () => {
        client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
    });

    client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
}
