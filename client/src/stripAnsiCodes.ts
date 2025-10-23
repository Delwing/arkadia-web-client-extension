import { collectHiddenSequences } from "./scripts/hiddenSequences";

export const stripAnsiCodes = (str: string): string => {
    const sequences = collectHiddenSequences(str);
    if (sequences.length === 0) {
        return str;
    }

    let result = "";
    let lastIndex = 0;
    for (const seq of sequences) {
        if (seq.start > lastIndex) {
            result += str.slice(lastIndex, seq.start);
        }
        lastIndex = seq.end;
    }
    if (lastIndex < str.length) {
        result += str.slice(lastIndex);
    }
    return result;
};
