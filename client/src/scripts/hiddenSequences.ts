interface HiddenSequence {
    start: number;
    end: number;
    text: string;
}

const ESC = '\u001b';
const CSI = '\u009b';

const PREFIX_CHARS = new Set(['[', '(', ')', '#', ';', '?']);

function isDigit(code: number): boolean {
    return code >= 48 && code <= 57;
}

function isAnsiTerminator(code: number): boolean {
    return (code >= 48 && code <= 57) || // digits
        (code >= 65 && code <= 79) || // A-O
        (code >= 82 && code <= 90) || // R-Z
        code === 99 || // c
        (code >= 102 && code <= 110) || // f-n
        code === 113 || // q
        code === 114 || // r
        code === 121 || // y
        code === 61 || // =
        code === 62 || // >
        code === 60; // <
}

function consumeAnsiSequence(text: string, start: number): number | null {
    const length = text.length;
    let index = start + 1;
    if (index >= length) {
        return null;
    }

    while (index < length && PREFIX_CHARS.has(text[index])) {
        index += 1;
    }

    while (index < length) {
        const code = text.charCodeAt(index);
        if (isDigit(code) || code === 59) { // semicolon
            index += 1;
            continue;
        }
        break;
    }

    if (index < length && isAnsiTerminator(text.charCodeAt(index))) {
        return index + 1;
    }

    return null;
}

function consumeClickSequence(text: string, start: number): number | null {
    const closeLiteral = '{clickClose}';
    if (text.startsWith(closeLiteral, start)) {
        return start + closeLiteral.length;
    }

    const openPrefix = '{clickOpen:';
    if (!text.startsWith(openPrefix, start)) {
        return null;
    }

    const length = text.length;
    let index = start + openPrefix.length;
    let sawDigits = false;

    while (index < length && isDigit(text.charCodeAt(index))) {
        index += 1;
        sawDigits = true;
    }

    if (!sawDigits) {
        return null;
    }

    if (index < length && text[index] === ':') {
        index += 1;
        while (index < length && text[index] !== '}') {
            index += 1;
        }
    }

    if (index < length && text[index] === '}') {
        return index + 1;
    }

    return null;
}

export function collectHiddenSequences(text: string): HiddenSequence[] {
    const sequences: HiddenSequence[] = [];
    const length = text.length;
    let index = 0;

    while (index < length) {
        const char = text[index];
        let end: number | null = null;

        if (char === ESC || char === CSI) {
            end = consumeAnsiSequence(text, index);
        } else if (char === '{') {
            end = consumeClickSequence(text, index);
        }

        if (end !== null && end > index) {
            sequences.push({ start: index, end, text: text.slice(index, end) });
            index = end;
            continue;
        }

        index += 1;
    }

    return sequences;
}

