import {getActiveCommandLine} from "../commandInput/activeCommandLine";
import {hasWorkingSpeechService} from "./browserSupport";
import {joinCompoundDirections} from "./directions";
import {boundedDistance} from "./editDistance";
import {spokenNumbersToDigits} from "./numberWords";
import {normalizeTranscript} from "./normalizeTranscript";
import {buildVocabulary, chooseTranscript, repairTranscript} from "./vocabularyBias";
import {getSpeechRecognitionCtor, SpeechDictation} from "./speechDictation";

export interface VoiceInputDeps {
    /** Mic toggle sitting in the command bar. Hidden when the API is missing. */
    button: HTMLButtonElement;
    /** The command line the transcript is written into. */
    input: HTMLTextAreaElement;
    /**
     * Words currently on screen, plus whatever the client suggests. Game nouns
     * are missing from the recogniser's language model, so this is what pulls
     * its guesses back towards the world the player is actually looking at.
     */
    getVocabulary?: () => string[];
    /** Send a command. Defaults to the UI's own command line. */
    submit?: (text: string) => void;
    /**
     * Whether this browser has a speech service behind the API. Defaults to
     * the real check; tests and other UIs can decide for themselves.
     */
    isBrowserSupported?: () => boolean;
    lang?: string;
}

export interface VoiceInputHandle {
    detach(): void;
    /** Password mode hides the command line, so dictation goes with it. */
    setEnabled(enabled: boolean): void;
}

/**
 * Spoken instead of pressing Enter, in hands-free mode.
 *
 * The list is deliberately a family rather than one word: "wyslij" is short,
 * unstressed and routinely comes back as "wysli" or "wyszli", and a keyword you
 * have to pronounce perfectly is a keyword that fails when you need it. Each
 * entry also tolerates one edit (see {@link matchesKeyword}), which covers the
 * rest of the near misses without reaching as far as ordinary words like
 * "wyslal".
 */
const SEND_WORDS = ['wyslij', 'wysli', 'wyszli', 'wyslic', 'wyszlij', 'wyslji', 'slij', 'enter'];
/** Spoken to throw away a misheard line rather than reaching for the keyboard. */
const CLEAR_WORDS = ['anuluj', 'skasuj', 'kasuj', 'wyczysc'];

/** A keyword only forgives an edit once it is long enough to be distinctive. */
const MIN_FUZZY_KEYWORD_LENGTH = 5;

function matchesKeyword(token: string, keywords: readonly string[]): boolean {
    return keywords.some(
        (keyword) =>
            token === keyword ||
            (keyword.length >= MIN_FUZZY_KEYWORD_LENGTH && boundedDistance(token, keyword, 1) <= 1),
    );
}

/** Hold the button this long to start a hands-free run instead of one command. */
const LONG_PRESS_MS = 500;

const IDLE_TITLE = 'Dyktowanie głosowe (przytrzymaj, aby dyktować bez przerwy)';
const LISTENING_TITLE = 'Słucham — kliknij, aby zakończyć';
const CONTINUOUS_TITLE = 'Tryb ciągły — powiedz "wyślij", aby wysłać';
const ERROR_TITLES: Record<string, string> = {
    network: 'Rozpoznawanie mowy nie mogło połączyć się z usługą — sprawdź połączenie',
    'not-allowed': 'Brak dostępu do mikrofonu — zezwól na niego w ustawieniach strony',
    'service-not-allowed': 'Przeglądarka nie udostępnia usługi rozpoznawania mowy',
    'audio-capture': 'Nie znaleziono mikrofonu',
    'restart-loop': 'Rozpoznawanie mowy przerywa się w kółko — spróbuj ponownie',
};

export type VoiceAction = 'send' | 'clear' | 'none';

/**
 * Split a trailing spoken keyword off a dictated line. Only the last word
 * counts, so "powiedz wyslij mu to" stays a sentence rather than a send.
 */
export function extractVoiceAction(text: string): {text: string; action: VoiceAction} {
    const tokens = text.split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1]?.toLowerCase();
    if (!last) return {text: '', action: 'none'};

    const action: VoiceAction = matchesKeyword(last, SEND_WORDS)
        ? 'send'
        : matchesKeyword(last, CLEAR_WORDS)
          ? 'clear'
          : 'none';
    if (action === 'none') return {text, action};

    return {text: tokens.slice(0, -1).join(' '), action};
}

/**
 * Wires the command bar's mic button to browser speech recognition.
 *
 * A click dictates one command: the transcript only *fills* the command line,
 * and the user reviews it and presses Enter. Holding the button (or
 * shift-clicking) starts a hands-free run instead, where the microphone stays
 * open and the spoken word "wyslij" takes the place of Enter.
 *
 * Either way the text is normalised (see {@link normalizeTranscript}) and
 * spliced in at the caret, so a half-typed command can be finished by voice.
 */
export function attachVoiceInput(deps: VoiceInputDeps): VoiceInputHandle {
    const {button, input} = deps;
    const ctor = getSpeechRecognitionCtor();
    const isBrowserSupported = deps.isBrowserSupported ?? hasWorkingSpeechService;

    // No recogniser, or one that would only ever fail: leave no button behind.
    if (!ctor || !isBrowserSupported()) {
        button.style.display = 'none';
        return {detach: () => {}, setEnabled: () => {}};
    }

    const getVocabulary = deps.getVocabulary ?? (() => []);
    const submit = deps.submit ?? ((text: string) => getActiveCommandLine()?.submit(text));

    // Text on either side of the caret when this utterance started. Every
    // transcript update — interim ones included — replaces what sits between.
    let prefix = '';
    let suffix = '';
    // The last interim hypothesis, kept because the recogniser's final rescore
    // is what mangles game vocabulary; the interim often had it right.
    let interim = '';
    // Sticks around after a failed run so the button can explain itself.
    let errorTitle: string | null = null;

    /** Anchor the next utterance to wherever the caret is now. */
    const baseline = (): void => {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        const head = input.value.slice(0, start);
        // Keep dictated words from gluing onto whatever was typed.
        prefix = head && !head.endsWith(' ') ? head + ' ' : head;
        suffix = input.value.slice(end);
        interim = '';
    };

    const write = (text: string): void => {
        input.value = prefix + text + suffix;
        const caret = prefix.length + text.length;
        input.setSelectionRange(caret, caret);
        input.dispatchEvent(new Event('input', {bubbles: true}));
    };

    const handleFinal = (alternatives: string[]): void => {
        // Judge every hypothesis the recogniser offered, plus the interim it
        // talked itself out of, against the words on screen.
        const candidates = [...alternatives, interim].map(normalizeTranscript).filter(Boolean);
        const vocabulary = buildVocabulary(getVocabulary());
        const heard = chooseTranscript(candidates, vocabulary);

        const continuous = dictation.getMode() === 'continuous';
        // The keyword is split off before repair: it is not a word from the
        // game, so pulling it towards one on screen could only break it.
        const {text: spoken, action} = continuous
            ? extractVoiceAction(heard)
            : {text: heard, action: 'none' as VoiceAction};
        const repaired = repairTranscript(spoken, vocabulary);
        // A number said out loud is a digit to the game, unless the word is one
        // of the few that is also a thing you can see.
        const withDigits = spokenNumbersToDigits(repaired, (word) => vocabulary.words.has(word));
        const text = joinCompoundDirections(withDigits);

        if (action === 'clear') {
            prefix = '';
            suffix = '';
            write('');
            baseline();
            return;
        }

        write(text);

        if (action === 'send') {
            const command = input.value.trim();
            if (command) submit(command);
            input.value = '';
            prefix = '';
            suffix = '';
        }

        if (continuous) {
            // The next utterance carries on after what is already there.
            baseline();
        } else {
            interim = '';
            input.focus();
        }
    };

    const dictation = new SpeechDictation({
        createRecognition: () => new ctor(),
        lang: deps.lang,
        onTranscript: ({transcript, alternatives, isFinal}) => {
            if (isFinal) {
                handleFinal(alternatives);
                return;
            }
            interim = transcript;
            write(normalizeTranscript(transcript));
        },
        onListeningChange: (listening) => {
            const continuous = dictation.getMode() === 'continuous';
            button.classList.toggle('listening', listening);
            button.classList.toggle('listening-continuous', listening && continuous);
            button.classList.toggle('voice-error', !listening && errorTitle !== null);
            button.title = listening
                ? (continuous ? CONTINUOUS_TITLE : LISTENING_TITLE)
                : (errorTitle ?? IDLE_TITLE);
            if (listening) {
                errorTitle = null;
                baseline();
            }
        },
        onError: (error) => {
            console.warn('Speech recognition error:', error);
            // Recognition runs against a cloud service, so a dead network or a
            // browser without speech backing would fail silently otherwise. The
            // run always ends right after, and `onListeningChange` shows this.
            errorTitle = ERROR_TITLES[error] ?? IDLE_TITLE;
        },
    });

    const ac = new AbortController();
    const o = {signal: ac.signal};

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressStarted = false;

    const cancelLongPress = (): void => {
        if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    // Taking focus here would move the caret we are about to splice into.
    button.addEventListener('mousedown', (e) => e.preventDefault(), o);

    button.addEventListener('pointerdown', () => {
        if (dictation.isListening()) return;
        longPressTimer = setTimeout(() => {
            longPressTimer = null;
            longPressStarted = true;
            dictation.start('continuous');
        }, LONG_PRESS_MS);
    }, o);

    button.addEventListener('pointerup', cancelLongPress, o);
    button.addEventListener('pointerleave', cancelLongPress, o);
    button.addEventListener('pointercancel', cancelLongPress, o);

    button.addEventListener('click', (e) => {
        cancelLongPress();
        if (longPressStarted) {
            // The hold already started a run; the click that follows is noise.
            longPressStarted = false;
            return;
        }
        dictation.toggle(e.shiftKey ? 'continuous' : 'once');
    }, o);

    button.title = IDLE_TITLE;

    return {
        detach: () => {
            cancelLongPress();
            dictation.abort();
            ac.abort();
        },
        setEnabled: (enabled) => {
            if (!enabled) dictation.abort();
            button.disabled = !enabled;
            button.style.display = enabled ? '' : 'none';
        },
    };
}
