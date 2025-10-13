import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";
import {getItemSync} from "../storage";

function toUpperSafe(text: string) {
    return text.split(/(\x1B\[[0-9;]*m)/g).map((seg, i) => i % 2 === 0 ? seg.toUpperCase() : seg).join('');
}

export interface UserMacro {
    type: 'uppercase' | 'color' | 'replace' | 'beep' | 'command';
    color?: string;
    to?: string;
    command?: string;
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
            const trigger = client.Triggers.registerTrigger(regexp, (raw, _, matches) => {
                if (!matches) return raw;
                const r = new RegExp(regexp.source, regexp.flags.includes('g') ? regexp.flags : regexp.flags + 'g');
                return raw.replace(r, (match) => {
                    let result = match;
                    item.macros?.forEach(m => {
                        switch (m.type) {
                            case 'uppercase':
                                result = toUpperSafe(result);
                                break;
                            case 'color':
                                if (m.color) {
                                    const code = findClosestColor(m.color);
                                    result = colorString(result, code);
                                }
                                break;
                            case 'replace':
                                result = m.to || '';
                                break;
                            case 'beep':
                                client.playSound('beep');
                                break;
                            case 'command':
                                if (m.command) {
                                    client.sendCommand(m.command);
                                }
                                break;
                        }
                    });
                    return result;
                });
            }, STORAGE_KEY);
            registered.push(trigger);
        });
    };

    apply(getItemSync(STORAGE_KEY) || []);
}
