import {boundedDistance} from "./editDistance";
import {normalizeTranscript} from "./normalizeTranscript";

/**
 * Speech services rescore an utterance against a general-Polish language model
 * when finalising it, so game vocabulary gets "corrected" into common words —
 * "zaslon ogrzyce" comes back as "zaslon o grzybice". There is no vocabulary
 * biasing in the Web Speech API to prevent that.
 *
 * What we do have is the screen: the ogress is in the room description you just
 * read. This module scores the recogniser's own competing hypotheses against
 * the words currently in the output buffer, and only then falls back to
 * repairing tokens the recogniser invented.
 */

/** Below this a word is too generic to be worth indexing. */
const MIN_VOCABULARY_LENGTH = 2;
/** Below this a mistaken token is too short to repair without guessing. */
const MIN_REPAIR_LENGTH = 4;
/** Word boundaries, once diacritics are folded away. */
const NON_WORD = /[^A-Za-z0-9]+/;

export interface Vocabulary {
    /** Every word on screen, folded the way a transcript is folded. */
    readonly words: ReadonlySet<string>;
    /** Folded word to how recently it was seen; higher wins ties. */
    readonly recency: ReadonlyMap<string, number>;
}

export const EMPTY_VOCABULARY: Vocabulary = {words: new Set(), recency: new Map()};

/** A single word, folded the same way a whole transcript is. */
const fold = normalizeTranscript;

/**
 * Index words from the output buffer and the command suggestions, oldest
 * source first so later sightings win the recency tie-break.
 */
export function buildVocabulary(sources: readonly string[]): Vocabulary {
    const words = new Set<string>();
    const recency = new Map<string, number>();
    let seen = 0;

    for (const source of sources) {
        // Fold first, split second: `\w` would cut "ogrzyce" short at the tail
        // vowel, leaving a stem that repair would happily type back at us.
        for (const word of normalizeTranscript(source).split(NON_WORD)) {
            if (word.length < MIN_VOCABULARY_LENGTH) continue;
            words.add(word);
            recency.set(word, seen++);
        }
    }

    return {words, recency};
}

/** Matched characters, so a candidate is judged on substance, not word count. */
export function scoreTranscript(text: string, vocab: Vocabulary): number {
    let score = 0;
    for (const token of text.split(/\s+/)) {
        const key = fold(token);
        if (key && vocab.words.has(key)) score += key.length;
    }
    return score;
}

/**
 * Pick the hypothesis that best matches what is on screen. Candidates come in
 * the recogniser's own order of confidence, and ties keep that order, so an
 * unrecognised utterance still yields the recogniser's first choice.
 */
export function chooseTranscript(candidates: readonly string[], vocab: Vocabulary): string {
    let best = '';
    let bestScore = -1;

    for (const candidate of candidates) {
        if (!candidate) continue;
        const score = scoreTranscript(candidate, vocab);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }

    return best;
}

/** How far a token may be from a real word before the match is a guess. */
function distanceLimit(length: number): number {
    return length >= 7 ? 2 : 1;
}

interface Match {
    word: string;
    distance: number;
}

function bestMatch(key: string, vocab: Vocabulary): Match | null {
    if (key.length < MIN_REPAIR_LENGTH) return null;
    if (vocab.words.has(key)) return {word: key, distance: 0};

    const limit = distanceLimit(key.length);
    let best: Match | null = null;
    let bestRecency = -1;

    for (const candidate of vocab.words) {
        if (Math.abs(candidate.length - key.length) > limit) continue;
        const distance = boundedDistance(key, candidate, limit);
        if (distance > limit) continue;

        const recency = vocab.recency.get(candidate) ?? -1;
        if (!best || distance < best.distance || (distance === best.distance && recency > bestRecency)) {
            best = {word: candidate, distance};
            bestRecency = recency;
        }
    }

    return best;
}

/**
 * Pull tokens the recogniser invented back towards words that are on screen.
 * Tokens that already are real words are left alone, and a token with no near
 * match survives untouched — this repairs, it does not translate.
 *
 * Adjacent tokens are also tried merged, which is how the language model's
 * favourite trick ("ogrzyce" split into "o grzybice") gets undone.
 */
export function repairTranscript(text: string, vocab: Vocabulary): string {
    if (!text || vocab.words.size === 0) return text;

    const tokens = text.split(/\s+/).filter(Boolean);
    const out: string[] = [];

    for (let i = 0; i < tokens.length; ) {
        const token = tokens[i];
        const key = fold(token);

        if (vocab.words.has(key)) {
            out.push(token);
            i++;
            continue;
        }

        const single = bestMatch(key, vocab);
        const next = tokens[i + 1];
        const merged = next ? bestMatch(key + fold(next), vocab) : null;

        if (merged && (!single || merged.distance <= single.distance)) {
            out.push(merged.word);
            i += 2;
        } else if (single) {
            out.push(single.word);
            i++;
        } else {
            out.push(token);
            i++;
        }
    }

    return out.join(' ');
}
