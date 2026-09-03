import {describe, expect, it} from 'vitest';
import {normalizeTranscript} from '@web/voice/normalizeTranscript';

describe('normalizeTranscript', () => {
    it('strips diacritics down to ASCII', () => {
        expect(normalizeTranscript('dobądź miecz')).toBe('dobadz miecz');
        expect(normalizeTranscript('weź świecę')).toBe('wez swiece');
    });

    it('folds stroked L, which NFD leaves behind', () => {
        expect(normalizeTranscript('łuk')).toBe('luk');
        expect(normalizeTranscript('Łuk')).toBe('luk');
    });

    it('drops sentence punctuation the recogniser adds', () => {
        expect(normalizeTranscript('zabij orka.')).toBe('zabij orka');
        expect(normalizeTranscript('co teraz?')).toBe('co teraz');
        expect(normalizeTranscript('„powiedz”')).toBe('powiedz');
    });

    it('collapses whitespace left by removed punctuation', () => {
        expect(normalizeTranscript('  polnoc ,  wschod  ')).toBe('polnoc wschod');
    });

    it('lowercases the sentence case speech comes back in', () => {
        expect(normalizeTranscript('Wschod')).toBe('wschod');
        expect(normalizeTranscript('Powiedz Elandowi')).toBe('powiedz elandowi');
    });

    it('returns an empty string for empty input', () => {
        expect(normalizeTranscript('')).toBe('');
    });
});
