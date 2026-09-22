/**
 * Reads text aloud for `speak` trigger macros and the `tts:speak` client event.
 *
 * Built on the browser's `speechSynthesis`: no service, no key, works offline
 * with the voices the operating system ships. The client only emits the event;
 * everything audible happens here, so the client stays DOM-free.
 */

import type Client from "@client/Client";
import type { UiSettings } from "@web/uiSettingsCore.ts";
import { load as loadUiSettings } from "@web/uiSettingsCore.ts";

export type TtsSettings = Pick<UiSettings, 'ttsEnabled' | 'ttsVoice' | 'ttsRate' | 'ttsPitch' | 'ttsVolume' | 'ttsInterrupt'>;

/**
 * Utterances allowed to wait behind the one being read. A trigger on a line the
 * game repeats (a fight, a spammed channel) would otherwise queue minutes of
 * speech that is stale by the time it is heard; past this, new text is dropped.
 */
const MAX_QUEUED = 3;

/** Longer text is cut: speech is for alerts, not for reading room descriptions. */
const MAX_LENGTH = 300;

export function isTtsSupported(): boolean {
    return typeof window !== 'undefined'
        && 'speechSynthesis' in window
        && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function getVoices(): SpeechSynthesisVoice[] {
    return isTtsSupported() ? window.speechSynthesis.getVoices() : [];
}

/**
 * The voice to read with: the chosen one when this device has it, otherwise a
 * Polish voice (local ones first — remote voices lag and fail offline), and
 * failing that `undefined`, which leaves it to the browser default.
 */
export function resolveVoice(voices: SpeechSynthesisVoice[], voiceUri: string): SpeechSynthesisVoice | undefined {
    if (voiceUri) {
        const chosen = voices.find(v => v.voiceURI === voiceUri);
        if (chosen) return chosen;
    }
    const polish = voices.filter(v => v.lang.toLowerCase().startsWith('pl'));
    return polish.find(v => v.localService) ?? polish[0];
}

let queued = 0;

export function stopSpeaking(): void {
    if (!isTtsSupported()) return;
    window.speechSynthesis.cancel();
    queued = 0;
}

/** Read `text` aloud with `settings`, regardless of `ttsEnabled` (used by the settings preview too). */
export function speak(text: string, settings: TtsSettings): void {
    if (!isTtsSupported()) return;
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
    if (!clean) return;

    const synth = window.speechSynthesis;
    if (settings.ttsInterrupt) {
        stopSpeaking();
    } else if (queued > MAX_QUEUED) {
        return;
    }

    const utterance = new SpeechSynthesisUtterance(clean);
    const voice = resolveVoice(synth.getVoices(), settings.ttsVoice);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'pl-PL';
    utterance.rate = settings.ttsRate;
    utterance.pitch = settings.ttsPitch;
    utterance.volume = settings.ttsVolume;

    queued++;
    const done = () => { queued = Math.max(0, queued - 1); };
    utterance.onend = done;
    utterance.onerror = done;

    // Chrome can leave the synthesizer paused after the tab was in the
    // background, silently swallowing everything queued after it.
    synth.resume();
    synth.speak(utterance);
}

export function initTextToSpeech(client: Client): void {
    if (!isTtsSupported()) return;

    // Voices load asynchronously; asking once makes Chrome start fetching them
    // so the first alert is not read by the fallback voice.
    window.speechSynthesis.getVoices();

    client.on('tts:speak', (payload) => {
        const text = payload?.text;
        if (typeof text !== 'string') return;
        // "Wycisz dzwieki" silences speech too: it is the one switch players
        // reach for when the client has to go quiet.
        if (client.SoundManager.isMuted) return;
        const settings = loadUiSettings();
        if (!settings.ttsEnabled) return;
        speak(text, settings);
    });

    client.on('tts:stop', () => stopSpeaking());
    client.on('sound:muted', (muted) => {
        if (muted) stopSpeaking();
    });
}
