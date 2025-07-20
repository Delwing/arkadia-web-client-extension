import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

function toUpperSafe(text: string) {
    return text.split(/(\x1B\[[0-9;]*m)/g).map((seg, i) => i % 2 === 0 ? seg.toUpperCase() : seg).join('');
}

export interface UserMacro {
    type: 'uppercase' | 'color' | 'replace';
    color?: string;
    from?: string;
    to?: string;
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
            const trigger = client.Triggers.registerTrigger(regexp, (raw) => {
                let line = raw;
                item.macros?.forEach(m => {
                    switch (m.type) {
                        case 'uppercase':
                            line = toUpperSafe(line);
                            break;
                        case 'color':
                            if (m.color) {
                                const code = findClosestColor(m.color);
                                line = colorString(line, code);
                            }
                            break;
                        case 'replace':
                            if (m.from) {
                                try {
                                    const r = new RegExp(m.from, 'g');
                                    line = line.replace(r, m.to || '');
                                } catch {
                                    line = line.split(m.from).join(m.to || '');
                                }
                            }
                            break;
                    }
                });
                return line;
            }, STORAGE_KEY);
            registered.push(trigger);
        });
    };

    client.addEventListener('storage', (ev: CustomEvent) => {
        if (ev.detail.key === STORAGE_KEY) {
            apply(Array.isArray(ev.detail.value) ? ev.detail.value : []);
        }
    });

    client.addEventListener('port-connected', () => {
        client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
    });

    client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
}
