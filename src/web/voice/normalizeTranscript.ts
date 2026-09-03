/**
 * Speech results come back as prose - capitalised, punctuated and carrying
 * full Polish diacritics. The game is typed in bare lowercase ASCII, so every
 * transcript is folded down before it lands in the command line.
 *
 * Case is folded here rather than left to the autoLowercaseCommands setting:
 * that setting governs what the player typed, and speech capitalises every
 * utterance as if it were a sentence.
 */

/** Combining marks left behind by the NFD decomposition. */
const DIACRITIC_MARKS = /[\u0300-\u036f]/g;
/** Stroked l - the one Polish letter NFD does not decompose. */
const STROKED_L = /\u0142/g;
/** Sentence punctuation the recogniser adds; ASCII and typographic alike. */
const PUNCTUATION = /[.,!?;:()[\]{}"'\u2018\u2019\u201a\u201c\u201d\u201e]/g;
const WHITESPACE = /\s+/g;

export function normalizeTranscript(raw: string): string {
    if (!raw) return '';
    return raw
        .toLowerCase()
        .normalize('NFD')
        .replace(DIACRITIC_MARKS, '')
        .replace(STROKED_L, 'l')
        .replace(PUNCTUATION, ' ')
        .replace(WHITESPACE, ' ')
        .trim();
}
