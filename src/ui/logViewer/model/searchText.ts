/**
 * A session reduced to what an All-logs search reads.
 *
 * Counting hits needs each line's text, channel and character, and none of
 * the rest a `LogLine` carries (its HTML, event, timestamp). Kept this way a
 * log is small enough to store next to the records and read back whole, so a
 * search across every log skips parsing them — which is most of what it cost.
 *
 * Plain data, so it survives IndexedDB's structured clone as it is.
 */
import { CHANNELS, type Channel } from "./channels";
import type { SessionTally } from "./crossHits";
import { findTextHits, indexJoinedText } from "./search";
import type { LogLine } from "./types";

export interface SearchText {
    /** Every line's text, joined with `\n`. */
    text: string;
    /** Each line's channel, as an index into `channelNames`. */
    channels: Uint8Array;
    /**
     * The channel names the indices point at, stored with them so a reordered
     * `CHANNELS` in a later build does not misread an old entry.
     */
    channelNames: string[];
    /** The character from each `line` on, until the next run starts. */
    characterRuns: { line: number; character?: string }[];
}

export function toSearchText(lines: readonly LogLine[]): SearchText {
    const channels = new Uint8Array(lines.length);
    const characterRuns: SearchText["characterRuns"] = [];
    const texts = new Array<string>(lines.length);
    lines.forEach((line, index) => {
        texts[index] = line.text;
        channels[index] = CHANNELS.indexOf(line.channel);
        const previous = characterRuns[characterRuns.length - 1];
        if (!previous || previous.character !== line.character) {
            characterRuns.push({ line: index, character: line.character });
        }
    });
    return { text: texts.join("\n"), channels, channelNames: [...CHANNELS], characterRuns };
}

/** The same tally `tallySession` makes from lines, made from a stored text. */
export function tallySearchText(
    searchText: SearchText,
    query: string,
    options: { regex: boolean; caseSensitive: boolean },
    regex: RegExp,
): SessionTally {
    const result: SessionTally = {};
    const runs = searchText.characterRuns;
    let run = 0;
    // Hits come in line order, so the character run only ever moves forward.
    for (const hit of findTextHits(indexJoinedText(searchText.text), query, options, regex)) {
        while (run + 1 < runs.length && runs[run + 1].line <= hit.line) run += 1;
        const character = runs[run]?.character;
        const channel = searchText.channelNames[searchText.channels[hit.line]] as Channel | undefined;
        if (!channel) continue;
        const entry = result[channel];
        if (entry) {
            entry.count += hit.count;
            entry.lastLine = hit.line;
            entry.last = character;
        } else {
            result[channel] = { count: hit.count, firstLine: hit.line, first: character, lastLine: hit.line, last: character };
        }
    }
    return result;
}
