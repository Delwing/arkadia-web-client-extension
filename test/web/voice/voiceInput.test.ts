import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {attachVoiceInput, extractVoiceAction} from '@web/voice/voiceInput';
import type {SpeechRecognitionEventLike, SpeechRecognitionLike} from '@web/voice/speechDictation';

let lastRecognition: FakeRecognition | null = null;

class FakeRecognition implements SpeechRecognitionLike {
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 0;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
    onerror: ((event: {error: string}) => void) | null = null;
    onend: (() => void) | null = null;

    aborted = 0;
    stopped = 0;

    constructor() {
        lastRecognition = this;
    }

    start(): void {}
    stop(): void {
        this.stopped++;
    }
    abort(): void {
        this.aborted++;
    }

    /** Speak one utterance, optionally with competing hypotheses. */
    say(transcripts: string | string[], isFinal = true): void {
        const list = Array.isArray(transcripts) ? transcripts : [transcripts];
        const results: Record<number, unknown> & {length: number} = {length: 1};
        results[0] = alternativesOf(list, isFinal);
        this.onresult?.({resultIndex: 0, results} as unknown as SpeechRecognitionEventLike);
    }

    /**
     * Re-announce an utterance already delivered, the way a continuous session
     * does on every later event, with `resultIndex` past the old segment.
     */
    repeatPrevious(transcript: string, addition?: string): void {
        const results: Record<number, unknown> & {length: number} = {length: addition ? 2 : 1};
        results[0] = alternativesOf([transcript], true);
        if (addition) results[1] = alternativesOf([addition], false);
        this.onresult?.({resultIndex: 1, results} as unknown as SpeechRecognitionEventLike);
    }
}

function alternativesOf(list: string[], isFinal: boolean) {
    const alternatives: Record<number, unknown> & {isFinal: boolean; length: number} = {
        isFinal,
        length: list.length,
    };
    list.forEach((transcript, i) => {
        alternatives[i] = {transcript};
    });
    return alternatives;
}

function mount() {
    const button = document.createElement('button');
    const input = document.createElement('textarea');
    document.body.append(button, input);
    return {button, input};
}

/** Start a hands-free run the way a user would: shift-click. */
function shiftClick(button: HTMLButtonElement): void {
    button.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey: true}));
}

const ROOM = ['Ogrzyca warczy na ciebie.', 'Widzisz tu: ogrzycę, zardzewiały miecz.'];

describe('extractVoiceAction', () => {
    it('takes a trailing send keyword off the line', () => {
        expect(extractVoiceAction('zabij orka wyslij')).toEqual({text: 'zabij orka', action: 'send'});
    });

    it('recognises a bare keyword', () => {
        expect(extractVoiceAction('wyslij')).toEqual({text: '', action: 'send'});
    });

    it.each(['wyslij', 'wysli', 'wyszli', 'wysle', 'wyslic', 'wyszlij', 'slij'])(
        'accepts %s as the send keyword, because the word is hard to hit exactly',
        (spoken) => {
            expect(extractVoiceAction('zabij orka ' + spoken)).toEqual({text: 'zabij orka', action: 'send'});
        },
    );

    it('does not mistake an ordinary word for the send keyword', () => {
        // Two edits from "wyslij", and something a player might actually say.
        expect(extractVoiceAction('powiedz on wyslal').action).toBe('none');
        expect(extractVoiceAction('zabij wysokiego orka').action).toBe('none');
    });

    it('takes a trailing clear keyword off the line', () => {
        expect(extractVoiceAction('zabij orka anuluj')).toEqual({text: 'zabij orka', action: 'clear'});
    });

    it('leaves a keyword alone anywhere but the end', () => {
        expect(extractVoiceAction('powiedz wyslij mu to')).toEqual({
            text: 'powiedz wyslij mu to',
            action: 'none',
        });
    });

    it('handles an empty line', () => {
        expect(extractVoiceAction('')).toEqual({text: '', action: 'none'});
    });
});

describe('attachVoiceInput', () => {
    beforeEach(() => {
        lastRecognition = null;
        (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    });

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).SpeechRecognition;
        document.body.innerHTML = '';
    });

    it('hides the button when the browser has no recogniser', () => {
        delete (window as unknown as Record<string, unknown>).SpeechRecognition;
        const {button, input} = mount();

        attachVoiceInput({button, input, isBrowserSupported: () => true});

        expect(button.style.display).toBe('none');
    });

    it('hides the button in a browser with no speech service behind the API', () => {
        const {button, input} = mount();

        attachVoiceInput({button, input, isBrowserSupported: () => false});

        expect(button.style.display).toBe('none');
    });

    it('never starts listening in an unsupported browser', () => {
        const {button, input} = mount();

        attachVoiceInput({button, input, isBrowserSupported: () => false});
        button.click();

        expect(lastRecognition).toBeNull();
    });

    it('hyphenates a diagonal direction in the command line too', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.click();
        lastRecognition?.say('północny zachód');

        expect(input.value).toBe('polnocny-zachod');
    });

    it('writes a normalised transcript into the command line', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.click();
        lastRecognition?.say('dobądź miecz.');

        expect(input.value).toBe('dobadz miecz');
    });

    it('does not send — only fills the field', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        attachVoiceInput({button, input, submit, isBrowserSupported: () => true});

        button.click();
        lastRecognition?.say('polnoc');

        expect(submit).not.toHaveBeenCalled();
        expect(input.value).toBe('polnoc');
    });

    it('replaces interim text rather than appending it', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.click();
        lastRecognition?.say('dob', false);
        lastRecognition?.say('dobadz', false);
        lastRecognition?.say('dobadz miecz', true);

        expect(input.value).toBe('dobadz miecz');
    });

    it('splices at the caret, keeping text typed on either side', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        input.value = 'powiedz do orka';
        input.setSelectionRange(7, 7);

        button.click();
        lastRecognition?.say('glosno');

        expect(input.value).toBe('powiedz glosno do orka');
        expect(input.selectionStart).toBe('powiedz glosno'.length);
    });

    it('notifies the command line so history browsing resets', () => {
        const {button, input} = mount();
        const onInput = vi.fn();
        input.addEventListener('input', onInput);
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.click();
        lastRecognition?.say('zabij orka');

        expect(onInput).toHaveBeenCalled();
    });

    it('marks the button while listening and clears it on end', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.click();
        expect(button.classList.contains('listening')).toBe(true);

        lastRecognition?.onend?.();
        expect(button.classList.contains('listening')).toBe(false);
    });

    it('explains a failed run on the button and clears it on the next try', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        button.click();
        lastRecognition?.onerror?.({error: 'network'});
        lastRecognition?.onend?.();

        expect(button.classList.contains('voice-error')).toBe(true);
        expect(button.title).toContain('połączyć');

        button.click();
        expect(button.classList.contains('voice-error')).toBe(false);
    });

    it('stops an active run on a second click', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.click();
        button.click();

        expect(lastRecognition?.stopped).toBe(1);
    });

    it('keeps focus in the command line when the button is pressed', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        const event = new MouseEvent('mousedown', {bubbles: true, cancelable: true});
        button.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it('hides and aborts dictation in password mode', () => {
        const {button, input} = mount();
        const handle = attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.click();
        handle.setEnabled(false);

        expect(lastRecognition?.aborted).toBe(1);
        expect(button.style.display).toBe('none');
        expect(button.disabled).toBe(true);

        handle.setEnabled(true);
        expect(button.style.display).toBe('');
        expect(button.disabled).toBe(false);
    });

    it('detach stops listening and unbinds the button', () => {
        const {button, input} = mount();
        const handle = attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.click();
        handle.detach();
        expect(lastRecognition?.aborted).toBe(1);

        lastRecognition = null;
        button.click();
        expect(lastRecognition).toBeNull();
    });
});

describe('attachVoiceInput vocabulary biasing', () => {
    beforeEach(() => {
        lastRecognition = null;
        (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    });

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).SpeechRecognition;
        document.body.innerHTML = '';
    });

    it('prefers the hypothesis matching what is on screen', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, getVocabulary: () => ROOM, isBrowserSupported: () => true});

        button.click();
        lastRecognition?.say(['zaslon o grzybice', 'zaslon ogrzyce'], true);

        expect(input.value).toBe('zaslon ogrzyce');
    });

    it('rescues the interim the recogniser talked itself out of', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, getVocabulary: () => ROOM, isBrowserSupported: () => true});

        button.click();
        lastRecognition?.say('zaslon ogrzyce', false);
        lastRecognition?.say('zaslon o grzybice', true);

        expect(input.value).toBe('zaslon ogrzyce');
    });

    it('leaves the transcript alone when nothing on screen matches', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, getVocabulary: () => ROOM, isBrowserSupported: () => true});

        button.click();
        lastRecognition?.say('przywolaj smoka', true);

        expect(input.value).toBe('przywolaj smoka');
    });
});

describe('attachVoiceInput in continuous mode', () => {
    beforeEach(() => {
        lastRecognition = null;
        (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    });

    afterEach(() => {
        vi.useRealTimers();
        delete (window as unknown as Record<string, unknown>).SpeechRecognition;
        document.body.innerHTML = '';
    });

    it('shift-click opens a hands-free run', () => {
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        shiftClick(button);

        expect(lastRecognition?.continuous).toBe(true);
        expect(button.classList.contains('listening-continuous')).toBe(true);
    });

    it('a long press opens one too, and the click after it is ignored', () => {
        vi.useFakeTimers();
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.dispatchEvent(new Event('pointerdown'));
        vi.advanceTimersByTime(600);
        button.dispatchEvent(new Event('pointerup'));
        button.click();

        expect(lastRecognition?.continuous).toBe(true);
        expect(button.classList.contains('listening')).toBe(true);
    });

    it('a short press is still a single utterance', () => {
        vi.useFakeTimers();
        const {button, input} = mount();
        attachVoiceInput({button, input, isBrowserSupported: () => true});

        button.dispatchEvent(new Event('pointerdown'));
        vi.advanceTimersByTime(100);
        button.dispatchEvent(new Event('pointerup'));
        button.click();

        expect(lastRecognition?.continuous).toBe(false);
    });

    it('sends on the spoken keyword and clears the line', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        attachVoiceInput({button, input, submit, isBrowserSupported: () => true});

        shiftClick(button);
        lastRecognition?.say('zabij orka', true);
        expect(submit).not.toHaveBeenCalled();

        lastRecognition?.say('wyslij', true);

        expect(submit).toHaveBeenCalledWith('zabij orka');
        expect(input.value).toBe('');
    });

    it('sends when the keyword ends the same utterance', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        attachVoiceInput({button, input, submit, isBrowserSupported: () => true});

        shiftClick(button);
        lastRecognition?.say('polnoc wyslij', true);

        expect(submit).toHaveBeenCalledWith('polnoc');
        expect(input.value).toBe('');
    });

    it('builds a line across several utterances', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        attachVoiceInput({button, input, submit, isBrowserSupported: () => true});

        shiftClick(button);
        lastRecognition?.say('powiedz', true);
        lastRecognition?.say('witaj przybyszu', true);

        expect(input.value).toBe('powiedz witaj przybyszu');

        lastRecognition?.say('wyslij', true);
        expect(submit).toHaveBeenCalledWith('powiedz witaj przybyszu');
    });

    it('throws away a misheard line on the clear keyword', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        attachVoiceInput({button, input, submit, isBrowserSupported: () => true});

        shiftClick(button);
        lastRecognition?.say('zabij o grzybice', true);
        lastRecognition?.say('anuluj', true);

        expect(input.value).toBe('');
        expect(submit).not.toHaveBeenCalled();
    });

    it('never sends on the keyword in single-utterance mode', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        attachVoiceInput({button, input, submit, isBrowserSupported: () => true});

        button.click();
        lastRecognition?.say('zabij orka wyslij', true);

        expect(submit).not.toHaveBeenCalled();
        expect(input.value).toBe('zabij orka wyslij');
    });

    it('sends a command once, however often the session re-announces it', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        attachVoiceInput({button, input, submit, isBrowserSupported: () => true});

        shiftClick(button);
        lastRecognition?.say('wschod wyslij', true);
        expect(submit).toHaveBeenCalledTimes(1);

        // What the browser actually does between utterances: fires again with
        // the whole session in `results`. Re-reading it would re-send "wschod".
        lastRecognition?.repeatPrevious('wschod wyslij');
        lastRecognition?.repeatPrevious('wschod wyslij');
        lastRecognition?.repeatPrevious('wschod wyslij', 'polnoc');

        expect(submit).toHaveBeenCalledTimes(1);
        expect(submit).toHaveBeenCalledWith('wschod');
    });

    it('does not let vocabulary repair chew up the keyword', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        // A screen full of words one edit away from what was heard.
        const screen = ['Ogr wyszla z jaskini.', 'Ogrzyca warczy.'];
        attachVoiceInput({button, input, submit, getVocabulary: () => screen, isBrowserSupported: () => true});

        shiftClick(button);
        lastRecognition?.say('polnoc wyszli', true);

        expect(submit).toHaveBeenCalledWith('polnoc');
    });

    it('hyphenates a diagonal direction before sending it', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        attachVoiceInput({button, input, submit, isBrowserSupported: () => true});

        shiftClick(button);
        lastRecognition?.say('polnocny zachod enter', true);

        expect(submit).toHaveBeenCalledWith('polnocny-zachod');
    });

    it('keeps listening after a send', () => {
        const {button, input} = mount();
        const submit = vi.fn();
        attachVoiceInput({button, input, submit, isBrowserSupported: () => true});

        shiftClick(button);
        lastRecognition?.say('polnoc wyslij', true);
        lastRecognition?.say('wschod wyslij', true);

        expect(submit).toHaveBeenNthCalledWith(1, 'polnoc');
        expect(submit).toHaveBeenNthCalledWith(2, 'wschod');
    });
});
