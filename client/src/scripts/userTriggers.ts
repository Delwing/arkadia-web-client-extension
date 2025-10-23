import Client from "../Client";
import { color, findClosestColor, RESET } from "../Colors";
import { stripAnsiCodes } from "../stripAnsiCodes";

function toUpperSafe(text: string) {
    return text.split(/(\x1B\[[0-9;]*m)/g).map((seg, i) => i % 2 === 0 ? seg.toUpperCase() : seg).join('');
}

const HIDDEN_SEQUENCE_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|{clickOpen:\d+(?::[^}]+)?}|{clickClose}/g;

interface AnsiState {
    foreground: string | null;
    background: string | null;
    foregroundReset: string | null;
    backgroundReset: string | null;
    fullReset: string | null;
    others: string[];
}

function cloneHiddenRegex(): RegExp {
    return new RegExp(HIDDEN_SEQUENCE_REGEX.source, 'g');
}

function updateAnsiState(state: AnsiState, sequence: string) {
    const paramsRaw = sequence.slice(2, -1);
    const params = paramsRaw.length > 0 ? paramsRaw.split(';') : ['0'];
    let resetsAll = false;
    let setsForeground = false;
    let setsBackground = false;
    let resetsForeground = false;
    let resetsBackground = false;

    for (let i = 0; i < params.length; i++) {
        const param = params[i];
        if (param === '') continue;
        if (param === '0') {
            resetsAll = true;
            break;
        }
        if (param === '39') {
            resetsForeground = true;
        } else if (param === '49') {
            resetsBackground = true;
        } else if (param === '38') {
            if (params[i + 1] === '5' && params[i + 2]) {
                setsForeground = true;
                i += 2;
                continue;
            }
        } else if (param === '48') {
            if (params[i + 1] === '5' && params[i + 2]) {
                setsBackground = true;
                i += 2;
                continue;
            }
        }
        const num = Number(param);
        if (!Number.isNaN(num)) {
            if ((num >= 30 && num <= 37) || (num >= 90 && num <= 97)) {
                setsForeground = true;
            } else if ((num >= 40 && num <= 47) || (num >= 100 && num <= 107)) {
                setsBackground = true;
            }
        }
    }

    if (resetsAll) {
        state.foreground = null;
        state.background = null;
        state.foregroundReset = null;
        state.backgroundReset = null;
        state.fullReset = sequence;
        state.others = [];
        return;
    }

    if (resetsForeground) {
        state.foreground = null;
        state.foregroundReset = sequence;
    }
    if (resetsBackground) {
        state.background = null;
        state.backgroundReset = sequence;
    }
    if (setsForeground) {
        state.foreground = sequence;
        state.foregroundReset = null;
    }
    if (setsBackground) {
        state.background = sequence;
        state.backgroundReset = null;
    }
    if (!setsForeground && !setsBackground && !resetsForeground && !resetsBackground) {
        state.others.push(sequence);
    }
}

function stateToString(state: AnsiState): string {
    const parts: string[] = [];
    if (state.fullReset) {
        parts.push(state.fullReset);
    }
    if (state.others.length > 0) {
        parts.push(...state.others);
    }
    if (state.foreground) {
        parts.push(state.foreground);
    } else if (state.foregroundReset) {
        parts.push(state.foregroundReset);
    }
    if (state.background) {
        parts.push(state.background);
    } else if (state.backgroundReset) {
        parts.push(state.backgroundReset);
    }
    return parts.join('');
}

function createIndexAndStates(raw: string, plain: string): { positions: number[]; states: string[] } {
    const positions = new Array(plain.length + 1).fill(raw.length);
    const states = new Array(plain.length + 1).fill('');
    const regex = cloneHiddenRegex();
    let match = regex.exec(raw);
    let nextHiddenStart = match ? match.index : -1;
    let nextHiddenEnd = match ? regex.lastIndex : -1;
    const state: AnsiState = {
        foreground: null,
        background: null,
        foregroundReset: null,
        backgroundReset: null,
        fullReset: null,
        others: [],
    };
    let rawIndex = 0;
    let plainIndex = 0;

    while (rawIndex < raw.length && plainIndex < plain.length) {
        if (nextHiddenStart !== -1 && rawIndex === nextHiddenStart) {
            const sequence = raw.slice(nextHiddenStart, nextHiddenEnd);
            if ((sequence[0] === '\u001b' || sequence[0] === '\u009b') && sequence.endsWith('m')) {
                updateAnsiState(state, sequence);
            }
            rawIndex = nextHiddenEnd;
            match = regex.exec(raw);
            nextHiddenStart = match ? match.index : -1;
            nextHiddenEnd = match ? regex.lastIndex : -1;
            continue;
        }
        states[plainIndex] = stateToString(state);
        positions[plainIndex] = rawIndex;
        rawIndex += 1;
        plainIndex += 1;
    }

    while (nextHiddenStart !== -1 && rawIndex <= raw.length) {
        if (rawIndex <= nextHiddenStart) {
            rawIndex = nextHiddenStart;
        }
        const sequence = raw.slice(nextHiddenStart, nextHiddenEnd);
        if ((sequence[0] === '\u001b' || sequence[0] === '\u009b') && sequence.endsWith('m')) {
            updateAnsiState(state, sequence);
        }
        rawIndex = nextHiddenEnd;
        match = regex.exec(raw);
        nextHiddenStart = match ? match.index : -1;
        nextHiddenEnd = match ? regex.lastIndex : -1;
    }

    const finalState = stateToString(state);
    states[plainIndex] = finalState;
    positions[plainIndex] = rawIndex;
    for (let i = plainIndex + 1; i < positions.length; i++) {
        positions[i] = rawIndex;
        states[i] = finalState;
    }
    return { positions, states };
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
                const plain = stripAnsiCodes(raw);
                const { positions, states } = createIndexAndStates(raw, plain);
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
