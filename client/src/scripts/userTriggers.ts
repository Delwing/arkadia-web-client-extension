import Client from "../Client";
import { color, findClosestColor, RESET } from "../Colors";
import { mapAnsi } from "../ansiMapping";

function toUpperSafe(text: string) {
    return text.split(/(\x1B\[[0-9;]*m)/g).map((seg, i) => i % 2 === 0 ? seg.toUpperCase() : seg).join('');
}

function buildReplacement(segment: string, matchText: string, startState: string, endState: string, macros: UserMacro[], client: Client): string {
    if (!macros || macros.length === 0) {
        return segment;
    }

    let replacement = matchText;
    let prefix = startState;
    let suffix = endState;
    let didModifyText = false;

    for (const macro of macros) {
        switch (macro.type) {
            case 'uppercase':
                replacement = toUpperSafe(replacement);
                didModifyText = true;
                break;
            case 'color':
                if (macro.color) {
                    const code = findClosestColor(macro.color);
                    prefix = `${prefix}${color(code)}`;
                    suffix = `${RESET}${suffix}`;
                    didModifyText = true;
                }
                break;
            case 'replace':
                replacement = macro.to ?? '';
                didModifyText = true;
                break;
            case 'beep':
                client.playSound('beep');
                break;
            case 'command':
                if (macro.command) {
                    client.sendCommand(macro.command);
                }
                break;
        }
    }

    if (!didModifyText) {
        return segment;
    }

    return `${prefix}${replacement}${suffix}`;
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
                const { plain, positions, states } = mapAnsi(raw);
                const r = new RegExp(regexp.source, regexp.flags.includes('g') ? regexp.flags : regexp.flags + 'g');
                const sanitizedMatches: { index: number; text: string }[] = [];
                let m: RegExpExecArray | null;
                while ((m = r.exec(plain)) !== null) {
                    if (m[0].length === 0) {
                        r.lastIndex += 1;
                        continue;
                    }
                    sanitizedMatches.push({ index: m.index, text: m[0] });
                }
                if (sanitizedMatches.length === 0) {
                    return raw;
                }
                let result = raw;
                let offset = 0;
                sanitizedMatches.forEach(({ index: startIndex, text }) => {
                    const endIndex = startIndex + text.length;
                    const rawStart = positions[startIndex] ?? result.length;
                    const rawEnd = positions[endIndex] ?? result.length;
                    const adjustedStart = rawStart + offset;
                    const adjustedEnd = rawEnd + offset;
                    const segment = result.slice(adjustedStart, adjustedEnd);
                    const replacement = buildReplacement(segment, text, states[startIndex] ?? '', states[endIndex] ?? '', item.macros ?? [], client);
                    result = result.slice(0, adjustedStart) + replacement + result.slice(adjustedEnd);
                    offset += replacement.length - segment.length;
                });
                return result;
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
