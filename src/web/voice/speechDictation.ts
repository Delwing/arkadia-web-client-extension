/**
 * Thin, testable wrapper around the browser's Web Speech API.
 *
 * The DOM lib does not type `SpeechRecognition`, so the slice we use is
 * declared structurally here; that same interface is what unit tests implement
 * to drive the dictation controller without a real recogniser.
 */

export interface SpeechRecognitionAlternativeLike {
    readonly transcript: string;
}

export interface SpeechRecognitionResultLike {
    readonly isFinal: boolean;
    readonly length: number;
    [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
    readonly error: string;
}

export interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * `once` closes as soon as the speaker stops — one press, one command.
 * `continuous` keeps the microphone open until it is switched off.
 */
export type DictationMode = 'once' | 'continuous';

export interface DictationResult {
    /** The recogniser's best guess; this is what gets shown live. */
    transcript: string;
    /** Competing hypotheses, best first. Only final results carry extras. */
    alternatives: string[];
    isFinal: boolean;
}

/** How many hypotheses to ask for, so vocabulary biasing has a choice. */
const MAX_ALTERNATIVES = 5;
/**
 * Continuous runs reopen the stream every time the browser closes it, which it
 * does after a few seconds of quiet. Silence is normal — a player reads, fights
 * and thinks between commands — so only streams that die *immediately* count
 * against the reopen budget. That still catches a broken microphone or a
 * service that refuses the connection, without ending a hands-free session
 * because nobody spoke for a minute.
 */
const MAX_FAILED_RESTARTS = 8;
/** A stream shorter than this never really opened. */
const MIN_HEALTHY_STREAM_MS = 300;

/** The vendor-prefixed constructor, or `null` where the API is missing. */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const scope = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
    return getSpeechRecognitionCtor() !== null;
}

export interface SpeechDictationDeps {
    /** Build a fresh recogniser. One per stream; discarded when it closes. */
    createRecognition: () => SpeechRecognitionLike;
    /** BCP-47 tag handed to the recogniser. Defaults to Polish. */
    lang?: string;
    /**
     * Called for every transcript update. Interim results are superseded by
     * later calls, so a consumer should always replace — never append — what it
     * showed last.
     */
    onTranscript: (result: DictationResult) => void;
    onListeningChange?: (listening: boolean) => void;
    onError?: (error: string) => void;
}

/**
 * A dictation session, in one of two shapes: a single utterance for the
 * press-to-talk button, or a stream that stays open for hands-free use.
 *
 * A continuous run survives the browser closing the stream on a pause — it just
 * opens another one, without the consumer seeing the seam.
 */
export class SpeechDictation {
    private readonly deps: SpeechDictationDeps;
    private recognition: SpeechRecognitionLike | null = null;
    private mode: DictationMode = 'once';
    /** Set while a stop was asked for, so the stream is not reopened. */
    private stopping = false;
    /** Set by an error that reopening cannot fix. */
    private fatal = false;
    private failedRestarts = 0;
    private streamOpenedAt = 0;

    constructor(deps: SpeechDictationDeps) {
        this.deps = deps;
    }

    isListening(): boolean {
        return this.recognition !== null;
    }

    getMode(): DictationMode {
        return this.mode;
    }

    toggle(mode: DictationMode = 'once'): void {
        if (this.isListening()) {
            this.stop();
        } else {
            this.start(mode);
        }
    }

    start(mode: DictationMode = 'once'): void {
        if (this.recognition) return;

        this.mode = mode;
        this.stopping = false;
        this.fatal = false;
        this.failedRestarts = 0;

        if (this.open()) {
            this.deps.onListeningChange?.(true);
        }
    }

    /** Ask for a graceful stop; the final result still arrives before `onend`. */
    stop(): void {
        this.stopping = true;
        this.recognition?.stop();
    }

    /** Drop the run without waiting for a final result. */
    abort(): void {
        const recognition = this.recognition;
        if (!recognition) return;
        this.stopping = true;
        this.release();
        this.deps.onListeningChange?.(false);
        recognition.abort();
    }

    /** Open a stream. Returns false if the browser refused to start one. */
    private open(): boolean {
        const recognition = this.deps.createRecognition();
        recognition.lang = this.deps.lang ?? 'pl-PL';
        recognition.continuous = this.mode === 'continuous';
        recognition.interimResults = true;
        recognition.maxAlternatives = MAX_ALTERNATIVES;

        recognition.onresult = (event) => this.handleResult(event);
        recognition.onerror = (event) => this.handleError(event);
        recognition.onend = () => this.handleEnd();

        this.recognition = recognition;
        this.streamOpenedAt = Date.now();

        try {
            recognition.start();
            return true;
        } catch (err) {
            console.warn('Speech recognition failed to start', err);
            this.release();
            this.deps.onError?.('start-failed');
            return false;
        }
    }

    private handleError(event: SpeechRecognitionErrorEventLike): void {
        // A silent stretch is routine, and in a continuous run it is expected:
        // the stream just gets reopened.
        if (event.error === 'no-speech' || event.error === 'aborted') return;

        // A dropped connection is worth reporting but not worth ending a
        // hands-free session over — the reopen budget bounds the retrying. A
        // refused microphone is different: no amount of reopening wins it back.
        this.fatal = event.error !== 'network';
        this.deps.onError?.(event.error);
    }

    private handleResult(event: SpeechRecognitionEventLike): void {
        const results = event.results;
        // A continuous session's `results` accumulates every utterance it has
        // heard, and `resultIndex` marks where this event's news begins.
        // Rebuilding from zero re-delivers utterances already handled — which
        // in hands-free mode means sending the same command again on every
        // event the browser fires afterwards.
        const start = Math.min(Math.max(event.resultIndex ?? 0, 0), results.length);

        let isFinal = false;
        let alternativeCount = 1;

        for (let i = start; i < results.length; i++) {
            const result = results[i];
            if (!result || result.length === 0) continue;
            if (result.isFinal) isFinal = true;
            alternativeCount = Math.max(alternativeCount, result.length);
        }

        const alternatives: string[] = [];
        for (let rank = 0; rank < Math.min(alternativeCount, MAX_ALTERNATIVES); rank++) {
            let text = '';
            for (let i = start; i < results.length; i++) {
                const result = results[i];
                if (!result || result.length === 0) continue;
                // Segments run out of alternatives at different depths; fall
                // back to a segment's best guess rather than dropping it.
                text += result[Math.min(rank, result.length - 1)].transcript;
            }
            if (text && !alternatives.includes(text)) alternatives.push(text);
        }

        if (alternatives.length === 0) return;

        this.failedRestarts = 0;
        this.deps.onTranscript({transcript: alternatives[0], alternatives, isFinal});
    }

    private handleEnd(): void {
        if (!this.recognition) return;

        const reopen = this.mode === 'continuous' && !this.stopping && !this.fatal;
        // A stream that ran for a while and simply heard nothing is healthy.
        this.failedRestarts =
            Date.now() - this.streamOpenedAt < MIN_HEALTHY_STREAM_MS ? this.failedRestarts + 1 : 0;

        if (reopen && this.failedRestarts <= MAX_FAILED_RESTARTS) {
            this.release();
            if (!this.open()) this.deps.onListeningChange?.(false);
            return;
        }

        if (reopen) this.deps.onError?.('restart-loop');
        this.release();
        this.deps.onListeningChange?.(false);
    }

    /** Detach from the current stream without announcing anything. */
    private release(): void {
        const recognition = this.recognition;
        if (!recognition) return;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        this.recognition = null;
    }
}
