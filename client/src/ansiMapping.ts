import { collectHiddenSequences } from "./scripts/hiddenSequences";

interface AnsiState {
    foreground: string | null;
    background: string | null;
    foregroundReset: string | null;
    backgroundReset: string | null;
    fullReset: string | null;
    others: string[];
}

function createInitialState(): AnsiState {
    return {
        foreground: null,
        background: null,
        foregroundReset: null,
        backgroundReset: null,
        fullReset: null,
        others: [],
    };
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

function isAnsiColorSequence(sequence: string): boolean {
    const firstChar = sequence[0];
    return (firstChar === '\u001b' || firstChar === '\u009b') && sequence.endsWith('m');
}

export interface AnsiMap {
    plain: string;
    positions: number[];
    states: string[];
}

export interface PlainSegment {
    raw: string;
    plain: string;
    startPlain: number;
    endPlain: number;
    startState: string;
    endState: string;
}

export function mapAnsi(raw: string): AnsiMap {
    const hiddenSequences = collectHiddenSequences(raw);
    const positions: number[] = [];
    const states: string[] = [];
    const plainParts: string[] = [];
    const state = createInitialState();
    let rawIndex = 0;
    let plainIndex = 0;
    let hiddenIndex = 0;
    let nextHidden = hiddenSequences[hiddenIndex] ?? null;

    while (rawIndex < raw.length) {
        if (nextHidden && rawIndex === nextHidden.start) {
            if (isAnsiColorSequence(nextHidden.text)) {
                updateAnsiState(state, nextHidden.text);
            }
            rawIndex = nextHidden.end;
            hiddenIndex += 1;
            nextHidden = hiddenSequences[hiddenIndex] ?? null;
            continue;
        }
        states[plainIndex] = stateToString(state);
        positions[plainIndex] = rawIndex;
        plainParts.push(raw[rawIndex]);
        rawIndex += 1;
        plainIndex += 1;
    }

    while (nextHidden) {
        if (rawIndex <= nextHidden.start) {
            rawIndex = nextHidden.start;
        }
        if (isAnsiColorSequence(nextHidden.text)) {
            updateAnsiState(state, nextHidden.text);
        }
        rawIndex = nextHidden.end;
        hiddenIndex += 1;
        nextHidden = hiddenSequences[hiddenIndex] ?? null;
    }

    const finalState = stateToString(state);
    states[plainIndex] = finalState;
    positions[plainIndex] = rawIndex;

    return {
        plain: plainParts.join(''),
        positions,
        states,
    };
}

export function clampPlainIndex(index: number, plainLength: number): number {
    if (index <= 0) {
        return 0;
    }
    if (index >= plainLength) {
        return plainLength;
    }
    return index;
}

export function rawIndexToPlain(mapping: AnsiMap, rawIndex: number): number {
    if (rawIndex <= 0) {
        return 0;
    }
    const { positions, plain } = mapping;
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        if (pos === undefined) {
            continue;
        }
        if (pos >= rawIndex) {
            return i;
        }
    }
    return plain.length;
}

export function replacePlainSegment(
    rawLine: string,
    startPlain: number,
    endPlain: number,
    build: (segment: PlainSegment) => string,
    mappingArg?: AnsiMap,
): string {
    const mapping = mappingArg ?? mapAnsi(rawLine);
    const plainLength = mapping.plain.length;
    const safeStart = clampPlainIndex(startPlain, plainLength);
    const safeEnd = clampPlainIndex(endPlain, plainLength);
    const from = Math.min(safeStart, safeEnd);
    const to = Math.max(safeStart, safeEnd);
    const rawStart = mapping.positions[from] ?? rawLine.length;
    const rawEnd = mapping.positions[to] ?? rawLine.length;

    const segment: PlainSegment = {
        raw: rawLine.slice(rawStart, rawEnd),
        plain: mapping.plain.slice(from, to),
        startPlain: from,
        endPlain: to,
        startState: mapping.states[from] ?? '',
        endState: mapping.states[to] ?? '',
    };

    const replacement = build(segment);
    return rawLine.slice(0, rawStart) + replacement + rawLine.slice(rawEnd);
}

