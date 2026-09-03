import {describe, expect, it} from 'vitest';
import {
    buildVocabulary,
    chooseTranscript,
    EMPTY_VOCABULARY,
    repairTranscript,
    scoreTranscript,
} from '@web/voice/vocabularyBias';

/** A room description of the kind the ogress actually shows up in. */
const ROOM = [
    'Stoisz na skraju lasu. Ogrzyca warczy na ciebie z gestwiny.',
    'Widzisz tu: ogrzycę, zardzewiały miecz.',
];

describe('buildVocabulary', () => {
    it('folds diacritics so on-screen words match dictated ones', () => {
        const vocab = buildVocabulary(['Widzisz tu ogrzycę.']);
        expect(vocab.words.has('ogrzyce')).toBe(true);
    });

    it('keeps whole words where a word-character split would truncate them', () => {
        const vocab = buildVocabulary(['zardzewiały miecz']);
        expect(vocab.words.has('zardzewialy')).toBe(true);
        expect(vocab.words.has('zardzewia')).toBe(false);
    });

    it('indexes a sentence-initial capital under its lowercase form', () => {
        const vocab = buildVocabulary(['Ogrzyca warczy.']);
        expect(vocab.words.has('ogrzyca')).toBe(true);
        expect(vocab.words.has('Ogrzyca')).toBe(false);
    });

    it('skips one-character noise', () => {
        const vocab = buildVocabulary(['a b do']);
        expect(vocab.words.has('a')).toBe(false);
        expect(vocab.words.has('do')).toBe(true);
    });
});

describe('scoreTranscript', () => {
    it('counts matched characters, not matched words', () => {
        const vocab = buildVocabulary(ROOM);
        expect(scoreTranscript('ogrzyca', vocab)).toBe(7);
        expect(scoreTranscript('smok', vocab)).toBe(0);
    });
});

describe('chooseTranscript', () => {
    it('picks the hypothesis that matches what is on screen', () => {
        const vocab = buildVocabulary(ROOM);
        const chosen = chooseTranscript(['zaslon o grzybice', 'zaslon ogrzyce'], vocab);
        expect(chosen).toBe('zaslon ogrzyce');
    });

    it('keeps the recogniser order when nothing distinguishes the candidates', () => {
        const chosen = chooseTranscript(['pierwsza', 'druga'], EMPTY_VOCABULARY);
        expect(chosen).toBe('pierwsza');
    });

    it('ignores empty candidates', () => {
        const chosen = chooseTranscript(['', 'zabij orka'], EMPTY_VOCABULARY);
        expect(chosen).toBe('zabij orka');
    });
});

describe('repairTranscript', () => {
    it('merges a word the language model split apart', () => {
        const vocab = buildVocabulary(ROOM);
        expect(repairTranscript('zaslon o grzybice', vocab)).toBe('zaslon ogrzyce');
    });

    it('pulls a near-miss back to the word on screen', () => {
        const vocab = buildVocabulary(ROOM);
        expect(repairTranscript('zabij ogrzycy', vocab)).toBe('zabij ogrzyce');
    });

    it('leaves words that are already on screen alone', () => {
        const vocab = buildVocabulary(ROOM);
        expect(repairTranscript('zabij ogrzyce', vocab)).toBe('zabij ogrzyce');
    });

    it('leaves a word with no near match untouched', () => {
        const vocab = buildVocabulary(ROOM);
        expect(repairTranscript('przywolaj smoka', vocab)).toBe('przywolaj smoka');
    });

    it('will not guess at short tokens', () => {
        const vocab = buildVocabulary(['polnoc']);
        expect(repairTranscript('pol', vocab)).toBe('pol');
    });

    it('holds a long word to a tighter relative distance than a short one', () => {
        const vocab = buildVocabulary(['kowalstwo']);
        // Two edits on a nine-letter word is within reach...
        expect(repairTranscript('kowalstwa', vocab)).toBe('kowalstwo');
        // ...but a five-letter word only gets one.
        const short = buildVocabulary(['sztylet']);
        expect(repairTranscript('sztyl', short)).toBe('sztyl');
    });

    it('is a no-op without a vocabulary', () => {
        expect(repairTranscript('zaslon o grzybice', EMPTY_VOCABULARY)).toBe('zaslon o grzybice');
    });

    it('types back the lowercase form of a capitalised word on screen', () => {
        const vocab = buildVocabulary(['Elandil stoi tutaj.']);
        expect(repairTranscript('elandim', vocab)).toBe('elandil');
    });
});

describe('choosing then repairing, as the command line does', () => {
    const bias = (candidates: string[], vocab = buildVocabulary(ROOM)): string =>
        repairTranscript(chooseTranscript(candidates, vocab), vocab);

    it('recovers a game word from a rescored transcript', () => {
        // Exactly the case seen in play: "zaslon ogrzyce" came back rescored
        // into common Polish, and no alternative is clean either, so the merge
        // repair has to do the work.
        expect(bias(['zaslon o grzybice', 'zaslon o grzyce'])).toBe('zaslon ogrzyce');
    });

    it('passes an unremarkable command straight through', () => {
        expect(bias(['polnoc'])).toBe('polnoc');
    });
});
