import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
    isSpeechRecognitionSupported,
    SpeechDictation,
    type SpeechRecognitionEventLike,
    type SpeechRecognitionLike,
} from '@web/voice/speechDictation';

interface Segment {
    /** Hypotheses for this segment, best first. */
    transcripts: string[];
    isFinal: boolean;
}

/** Stand-in for the browser recogniser, driven by hand from the tests. */
class FakeRecognition implements SpeechRecognitionLike {
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 0;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
    onerror: ((event: {error: string}) => void) | null = null;
    onend: (() => void) | null = null;

    started = 0;
    stopped = 0;
    aborted = 0;
    startThrows = false;

    start(): void {
        if (this.startThrows) throw new Error('already started');
        this.started++;
    }
    stop(): void {
        this.stopped++;
    }
    abort(): void {
        this.aborted++;
    }

    emit(segments: Segment[], resultIndex = 0): void {
        const results: Record<number, unknown> & {length: number} = {length: segments.length};
        segments.forEach((segment, i) => {
            const alternatives: Record<number, unknown> & {isFinal: boolean; length: number} = {
                isFinal: segment.isFinal,
                length: segment.transcripts.length,
            };
            segment.transcripts.forEach((transcript, j) => {
                alternatives[j] = {transcript};
            });
            results[i] = alternatives;
        });
        this.onresult?.({resultIndex, results} as unknown as SpeechRecognitionEventLike);
    }

    say(transcript: string, isFinal = true): void {
        this.emit([{transcripts: [transcript], isFinal}]);
    }
}

type DictationDeps = ConstructorParameters<typeof SpeechDictation>[0];

function setup(overrides: Partial<DictationDeps> = {}) {
    const created: FakeRecognition[] = [];
    const onTranscript = vi.fn();
    const onListeningChange = vi.fn();
    const onError = vi.fn();
    const dictation = new SpeechDictation({
        createRecognition: () => {
            const recognition = new FakeRecognition();
            created.push(recognition);
            return recognition;
        },
        onTranscript,
        onListeningChange,
        onError,
        ...overrides,
    });
    return {
        created,
        latest: () => created[created.length - 1],
        dictation,
        onTranscript,
        onListeningChange,
        onError,
    };
}

describe('SpeechDictation', () => {
    it('configures the recogniser for a single Polish utterance', () => {
        const {latest, dictation} = setup();
        dictation.start();

        expect(latest().started).toBe(1);
        expect(latest().lang).toBe('pl-PL');
        expect(latest().continuous).toBe(false);
        expect(latest().interimResults).toBe(true);
        expect(latest().maxAlternatives).toBeGreaterThan(1);
    });

    it('honours an explicit language', () => {
        const {latest, dictation} = setup({lang: 'en-US'});
        dictation.start();
        expect(latest().lang).toBe('en-US');
    });

    it('reports interim and final transcripts', () => {
        const {latest, dictation, onTranscript} = setup();
        dictation.start();

        latest().say('dobadz', false);
        expect(onTranscript).toHaveBeenLastCalledWith({
            transcript: 'dobadz',
            alternatives: ['dobadz'],
            isFinal: false,
        });

        latest().say('dobadz miecz', true);
        expect(onTranscript).toHaveBeenLastCalledWith({
            transcript: 'dobadz miecz',
            alternatives: ['dobadz miecz'],
            isFinal: true,
        });
    });

    it('passes competing hypotheses through, best first', () => {
        const {latest, dictation, onTranscript} = setup();
        dictation.start();

        latest().emit([{transcripts: ['zaslon o grzybice', 'zaslon ogrzyce'], isFinal: true}]);

        expect(onTranscript).toHaveBeenLastCalledWith({
            transcript: 'zaslon o grzybice',
            alternatives: ['zaslon o grzybice', 'zaslon ogrzyce'],
            isFinal: true,
        });
    });

    it('joins multi-segment results, falling back to a segment best guess', () => {
        const {latest, dictation, onTranscript} = setup();
        dictation.start();

        latest().emit([
            {transcripts: ['polnoc ', 'poludnie '], isFinal: true},
            {transcripts: ['wschod'], isFinal: false},
        ]);

        const result = onTranscript.mock.lastCall?.[0];
        expect(result.alternatives).toEqual(['polnoc wschod', 'poludnie wschod']);
    });

    it('drops duplicate hypotheses', () => {
        const {latest, dictation, onTranscript} = setup();
        dictation.start();

        latest().emit([{transcripts: ['zabij orka', 'zabij orka'], isFinal: true}]);

        expect(onTranscript.mock.lastCall?.[0].alternatives).toEqual(['zabij orka']);
    });

    it('tracks listening state across a run', () => {
        const {latest, dictation, onListeningChange} = setup();

        dictation.start();
        expect(dictation.isListening()).toBe(true);
        expect(onListeningChange).toHaveBeenLastCalledWith(true);

        latest().onend?.();
        expect(dictation.isListening()).toBe(false);
        expect(onListeningChange).toHaveBeenLastCalledWith(false);
    });

    it('ignores a second start while already listening', () => {
        const {created, dictation} = setup();
        dictation.start();
        dictation.start();
        expect(created).toHaveLength(1);
    });

    it('toggles between start and stop', () => {
        const {latest, dictation} = setup();
        dictation.toggle();
        expect(latest().started).toBe(1);

        dictation.toggle();
        expect(latest().stopped).toBe(1);
    });

    it('recovers when start throws', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const {dictation, onError, onListeningChange} = setup({
            createRecognition: () => {
                const recognition = new FakeRecognition();
                recognition.startThrows = true;
                return recognition;
            },
        });

        dictation.start();

        expect(dictation.isListening()).toBe(false);
        expect(onError).toHaveBeenCalledWith('start-failed');
        expect(onListeningChange).not.toHaveBeenCalledWith(true);
    });

    it('swallows no-speech and aborted errors', () => {
        const {latest, dictation, onError} = setup();
        dictation.start();

        latest().onerror?.({error: 'no-speech'});
        latest().onerror?.({error: 'aborted'});
        expect(onError).not.toHaveBeenCalled();

        latest().onerror?.({error: 'not-allowed'});
        expect(onError).toHaveBeenCalledWith('not-allowed');
    });

    it('abort stops listening without waiting for onend', () => {
        const {latest, dictation} = setup();
        dictation.start();
        dictation.abort();

        expect(latest().aborted).toBe(1);
        expect(dictation.isListening()).toBe(false);
    });

    it('abort on an idle dictation is a no-op', () => {
        const {created, dictation} = setup();
        dictation.abort();
        expect(created).toHaveLength(0);
    });
});

describe('SpeechDictation in continuous mode', () => {
    it('opens the stream in continuous mode', () => {
        const {latest, dictation} = setup();
        dictation.start('continuous');

        expect(latest().continuous).toBe(true);
        expect(dictation.getMode()).toBe('continuous');
    });

    it('reopens the stream the browser closed on a pause', () => {
        const {created, latest, dictation, onListeningChange} = setup();
        dictation.start('continuous');

        latest().say('zabij orka', true);
        latest().onend?.();

        expect(created).toHaveLength(2);
        expect(dictation.isListening()).toBe(true);
        // The seam must not show: no stop/start flicker on the button.
        expect(onListeningChange).toHaveBeenCalledTimes(1);
    });

    it('delivers only what an event says is new', () => {
        const {latest, dictation, onTranscript} = setup();
        dictation.start('continuous');

        // A continuous session keeps every utterance in `results`; only the
        // segments from `resultIndex` on belong to this event.
        latest().emit([{transcripts: ['wschod wyslij'], isFinal: true}], 0);
        expect(onTranscript).toHaveBeenLastCalledWith({
            transcript: 'wschod wyslij',
            alternatives: ['wschod wyslij'],
            isFinal: true,
        });

        latest().emit(
            [
                {transcripts: ['wschod wyslij'], isFinal: true},
                {transcripts: ['polnoc'], isFinal: false},
            ],
            1,
        );
        expect(onTranscript).toHaveBeenLastCalledWith({
            transcript: 'polnoc',
            alternatives: ['polnoc'],
            isFinal: false,
        });
    });

    it('says nothing when an event carries no new segments', () => {
        const {latest, dictation, onTranscript} = setup();
        dictation.start('continuous');

        latest().emit([{transcripts: ['wschod wyslij'], isFinal: true}], 0);
        onTranscript.mockClear();

        // The browser re-announcing the session so far must not look like speech.
        latest().emit([{transcripts: ['wschod wyslij'], isFinal: true}], 1);

        expect(onTranscript).not.toHaveBeenCalled();
    });

    it('stays closed once a stop was asked for', () => {
        const {created, latest, dictation, onListeningChange} = setup();
        dictation.start('continuous');

        dictation.stop();
        latest().onend?.();

        expect(created).toHaveLength(1);
        expect(dictation.isListening()).toBe(false);
        expect(onListeningChange).toHaveBeenLastCalledWith(false);
    });

    it('does not reopen after a fatal error', () => {
        const {created, latest, dictation, onError} = setup();
        dictation.start('continuous');

        latest().onerror?.({error: 'not-allowed'});
        latest().onend?.();

        expect(created).toHaveLength(1);
        expect(dictation.isListening()).toBe(false);
        expect(onError).toHaveBeenCalledWith('not-allowed');
    });

    it('keeps listening through long stretches of silence', () => {
        vi.useFakeTimers();
        try {
            const {created, dictation} = setup();
            dictation.start('continuous');

            // The browser closes the stream every few seconds of quiet. Twenty
            // such minutes is a player reading and fighting, not a fault.
            for (let i = 0; i < 200; i++) {
                vi.advanceTimersByTime(6000);
                created[created.length - 1].onend?.();
            }

            expect(dictation.isListening()).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('survives a dropped connection rather than ending the session', () => {
        vi.useFakeTimers();
        try {
            const {created, dictation, onError} = setup();
            dictation.start('continuous');

            vi.advanceTimersByTime(6000);
            created[created.length - 1].onerror?.({error: 'network'});
            created[created.length - 1].onend?.();

            expect(onError).toHaveBeenCalledWith('network');
            expect(dictation.isListening()).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('gives up on a stream that closes without ever hearing anything', () => {
        const {created, dictation, onError} = setup();
        dictation.start('continuous');

        for (let i = 0; i < 20; i++) {
            created[created.length - 1].onend?.();
        }

        expect(dictation.isListening()).toBe(false);
        expect(onError).toHaveBeenCalledWith('restart-loop');
        expect(created.length).toBeLessThan(20);
    });

    it('forgives instant closes once speech comes through', () => {
        const {created, dictation} = setup();
        dictation.start('continuous');

        for (let i = 0; i < 5; i++) {
            created[created.length - 1].onend?.();
        }
        created[created.length - 1].say('zabij orka', true);
        for (let i = 0; i < 5; i++) {
            created[created.length - 1].onend?.();
        }

        expect(dictation.isListening()).toBe(true);
    });

    it('stops permanently when the microphone itself is refused', () => {
        vi.useFakeTimers();
        try {
            const {created, dictation} = setup();
            dictation.start('continuous');

            vi.advanceTimersByTime(6000);
            created[created.length - 1].onerror?.({error: 'not-allowed'});
            created[created.length - 1].onend?.();

            expect(dictation.isListening()).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('isSpeechRecognitionSupported', () => {
    beforeEach(() => {
        delete (window as unknown as Record<string, unknown>).SpeechRecognition;
        delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    });

    it('is false when the browser has no recogniser', () => {
        expect(isSpeechRecognitionSupported()).toBe(false);
    });

    it('accepts the webkit-prefixed constructor', () => {
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
        expect(isSpeechRecognitionSupported()).toBe(true);
    });
});
