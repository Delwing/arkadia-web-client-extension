import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { resolveVoice, speak, stopSpeaking, type TtsSettings } from '@web/voice/textToSpeech.ts';

const voice = (voiceURI: string, lang: string, localService = true) =>
    ({ voiceURI, name: voiceURI, lang, localService, default: false }) as SpeechSynthesisVoice;

class FakeUtterance {
    voice?: SpeechSynthesisVoice;
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
}

const settings: TtsSettings = {
    ttsEnabled: true,
    ttsVoice: '',
    ttsRate: 1.5,
    ttsPitch: 0.8,
    ttsVolume: 0.5,
    ttsInterrupt: false,
};

describe('resolveVoice', () => {
    const voices = [voice('en', 'en-US'), voice('pl-remote', 'pl-PL', false), voice('pl-local', 'pl-PL')];

    test('uses the chosen voice when the device has it', () => {
        expect(resolveVoice(voices, 'en')?.voiceURI).toBe('en');
    });

    test('falls back to a local Polish voice', () => {
        expect(resolveVoice(voices, 'gone')?.voiceURI).toBe('pl-local');
        expect(resolveVoice(voices, '')?.voiceURI).toBe('pl-local');
    });

    test('leaves it to the browser when there is no Polish voice', () => {
        expect(resolveVoice([voice('en', 'en-US')], '')).toBeUndefined();
    });
});

describe('speak', () => {
    let spoken: FakeUtterance[];
    const synth = {
        speak: vi.fn((u: FakeUtterance) => { spoken.push(u); }),
        cancel: vi.fn(),
        resume: vi.fn(),
        getVoices: vi.fn(() => [voice('pl-local', 'pl-PL')]),
    };

    beforeEach(() => {
        spoken = [];
        vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
        Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
        stopSpeaking();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete (window as { speechSynthesis?: unknown }).speechSynthesis;
    });

    test('applies the settings and collapses whitespace', () => {
        speak('  Atakuje\n cie  troll ', settings);
        expect(spoken).toHaveLength(1);
        expect(spoken[0]).toMatchObject({ text: 'Atakuje cie troll', lang: 'pl-PL', rate: 1.5, pitch: 0.8, volume: 0.5 });
    });

    test('ignores blank text', () => {
        speak('   ', settings);
        expect(synth.speak).not.toHaveBeenCalled();
    });

    test('drops new text once the queue is full, and accepts again as it drains', () => {
        for (let i = 0; i < 10; i++) speak(`msg ${i}`, settings);
        expect(spoken).toHaveLength(4);

        spoken[0].onend?.();
        speak('after', settings);
        expect(spoken.at(-1)?.text).toBe('after');
    });

    test('interrupt cancels what is being read', () => {
        speak('first', settings);
        speak('second', { ...settings, ttsInterrupt: true });
        expect(synth.cancel).toHaveBeenCalledTimes(1);
        expect(spoken.map(u => u.text)).toEqual(['first', 'second']);
    });
});
