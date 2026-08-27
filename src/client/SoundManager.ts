import { globalStorage } from "@modules/core/storage";
import { getRenderSettings, onRenderSettingsChange } from "@modules/core/settings";
import { getCustomSound, getCustomSounds } from "@modules/core/customSounds";
import type Client from "./Client";
import type { SoundCategory } from '@shared/events/clientEvents.ts';
import type { SoundCategories } from '@shared/uiSettingsTypes';

export type SoundKey = string;

// Volume used to prime each cached <audio> element on first user gesture.
// Chrome's autoplay activation is per-element and requires what it considers
// real audio playback (silent/zero-amplitude data doesn't qualify), so we
// play each element briefly at audible-but-quiet volume, then pause.
const PRIMER_VOLUME = 0.1;

// Volume for the continuous keepalive loop. Real audio data played at
// -60 dB is effectively inaudible but keeps Chrome's "page is actively
// playing media" state engaged, which bypasses transient-activation
// expiration so background-tab triggers still produce audible output.
const KEEPALIVE_VOLUME = 0.001;

// The keepalive loop must play *real* (non-zero) PCM — Chrome ignores
// all-zero/silent tracks for the "actively playing media" state (see
// docs/AUDIO_SYSTEM.md constraint #3). Earlier it reused the beep src, but
// the beep is a full-scale tone, so looping it even at -60 dB left a faintly
// audible periodic beep. This generates a dedicated source instead: a short
// loop of low-amplitude pseudo-random noise (peak ~256 of 32767, ~-42 dBFS at
// the source). It has no tonal peaks and, played at KEEPALIVE_VOLUME, lands
// around -100 dBFS — genuinely inaudible — while staying non-zero PCM that
// Chrome counts as real playback. Built lazily and cached.
let keepaliveSrcCache: string | undefined;
function buildKeepaliveSrc(): string {
    if (keepaliveSrcCache) return keepaliveSrcCache;

    const sampleRate = 8000;
    const numSamples = sampleRate; // 1 second
    const bytesPerSample = 2;
    const dataSize = numSamples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    // Minimal 16-bit mono PCM WAV header.
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);                       // fmt chunk size
    view.setUint16(20, 1, true);                        // PCM
    view.setUint16(22, 1, true);                        // channels
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
    view.setUint16(32, bytesPerSample, true);           // block align
    view.setUint16(34, 16, true);                       // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Deterministic LCG so the buffer is reproducible (no Math.random); each
    // sample falls in [-256, 255].
    let seed = 0x9e3779b9;
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const sample = ((seed >>> 23) & 0x1ff) - 256;
        view.setInt16(offset, sample, true);
        offset += 2;
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    keepaliveSrcCache = 'data:audio/wav;base64,' + btoa(binary);
    return keepaliveSrcCache;
}

// iOS WebKit ignores HTMLAudioElement.volume (always reads/plays at 1.0),
// so the keepalive loop — designed to be inaudible at -60 dB — would play
// the beep at full hardware volume on a loop. iOS also doesn't enforce
// Chrome's ~5s transient-activation expiration, so the keepalive isn't
// needed there. Detect iPhone/iPod plus iPadOS 13+ (which reports as
// MacIntel but has multi-touch).
function isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export default class SoundManager {
    private elements = new Map<SoundKey, HTMLAudioElement>();
    private elementLoaders = new Map<SoundKey, Promise<HTMLAudioElement | undefined>>();
    private keepalive: HTMLAudioElement;
    private primerActivated = false;
    private muted = false;

    constructor(private readonly client: Client) {
        this.keepalive = new Audio();
        this.keepalive.preload = 'auto';
        this.keepalive.loop = true;
        this.keepalive.src = buildKeepaliveSrc();

        this.client.on("sound:play", ({ key }) => {
            if (typeof key === "string" && key) {
                this.play(key);
            }
        });
        this.client.on("sound:category", (category) => {
            this.playCategory(category);
        });

        // Re-resolve the cached "beep" element when the custom beep selection
        // changes, so categories left on "default beep" pick up the new sound
        // without requiring a page reload.
        let lastBeepKey = getRenderSettings().customBeepSoundKey || undefined;
        onRenderSettingsChange((render) => {
            const newKey = render.customBeepSoundKey || undefined;
            if (newKey !== lastBeepKey) {
                lastBeepKey = newKey;
                void this.refreshBeepSource().catch(() => {});
            }
        });

        // Fire-and-forget preload; swallow rejections (e.g. audio element
        // creation failing during test teardown) so they don't surface as
        // unhandled rejections.
        void this.discoverAndPreload().catch(() => {});

        this.installGestureListeners();
    }

    get isMuted(): boolean {
        return this.muted;
    }

    /**
     * Whether the near-silent keepalive loop is actually playing.
     *
     * Load-bearing beyond audio: a page playing audio is exempt from Chrome's
     * background tab freezing and timer throttling, so on Android this loop is what
     * keeps the game socket's ping alive while the user is in another app. Exposed
     * so a disconnect can report whether that protection was in place.
     */
    get keepaliveRunning(): boolean {
        return !this.keepalive.paused;
    }

    mute(): void {
        if (!this.muted) {
            this.muted = true;
            this.client.sendEvent("sound:muted", true);
        }
    }

    unmute(): void {
        if (this.muted) {
            this.muted = false;
            this.client.sendEvent("sound:muted", false);
        }
    }

    toggleMute(): boolean {
        if (this.muted) {
            this.unmute();
        } else {
            this.mute();
        }
        return this.muted;
    }

    async prepare(): Promise<void> {
        const keys = await this.getAllKnownSoundKeys();
        await Promise.all(Array.from(keys).map(key => this.ensureElement(key)));
    }

    /**
     * Public play entry point for UI preview buttons. Synchronous so the
     * audio.play() call stays inside the click's user-activation stack.
     */
    previewKey(key: SoundKey): void {
        this.play(key);
    }

    private async discoverAndPreload(): Promise<void> {
        const keys = await this.getAllKnownSoundKeys();
        await Promise.all(Array.from(keys).map(key => this.ensureElement(key)));
    }

    private installGestureListeners(): void {
        const onGesture = () => {
            if (this.primerActivated) return;
            this.activatePrimer();
        };
        const opts: AddEventListenerOptions = { capture: true, passive: true };
        document.addEventListener('click', onGesture, opts);
        document.addEventListener('keydown', onGesture, opts);
        document.addEventListener('touchstart', onGesture, opts);
        document.addEventListener('pointerdown', onGesture, opts);
    }

    private activatePrimer(): void {
        if (this.elements.size === 0) {
            console.warn('[SoundManager] primer skipped: no elements cached yet');
            return;
        }
        this.primerActivated = true;

        // Prime each cached element synchronously within the user gesture so
        // each gets its per-element autoplay activation.
        for (const [key, audio] of this.elements) {
            audio.volume = PRIMER_VOLUME;
            audio.muted = false;
            try {
                audio.currentTime = 0;
            } catch { /* ignore */ }
            const result = audio.play();
            if (result && typeof result.then === 'function') {
                result.then(() => {
                    audio.pause();
                    try { audio.currentTime = 0; } catch { /* ignore */ }
                    audio.volume = 1.0;
                }).catch((err) => {
                    audio.volume = 1.0;
                    console.warn('[SoundManager] prime failed for', key, err);
                });
            }
        }

        // Start the continuous keepalive loop. Uses a dedicated near-silent
        // noise source (set in the constructor) — the page just needs to be
        // continuously playing real audio data at non-zero volume; the source
        // is shaped to have no audible tonal content. Skipped on iOS where
        // volume is read-only (would loop at full hardware volume) and isn't
        // needed anyway.
        if (!isIOS()) {
            this.keepalive.volume = KEEPALIVE_VOLUME;
            this.keepalive.muted = false;
            this.keepalive.loop = true;
            this.keepalive.play().catch((err) => {
                console.warn('[SoundManager] keepalive failed', err);
            });
        }
    }

    private ensureElement(key: SoundKey): Promise<HTMLAudioElement | undefined> {
        const existing = this.elements.get(key);
        if (existing) return Promise.resolve(existing);

        let loader = this.elementLoaders.get(key);
        if (!loader) {
            loader = (async () => {
                const src = await this.resolveSrc(key);
                if (!src) return undefined;
                const audio = new Audio();
                audio.preload = 'auto';
                audio.src = src;
                this.elements.set(key, audio);
                return audio;
            })();
            this.elementLoaders.set(key, loader);
        }
        return loader;
    }

    /**
     * Re-resolve the cached "beep" element's source in place (keeping the
     * primed element) after the custom beep selection changes.
     */
    private async refreshBeepSource(): Promise<void> {
        const src = await this.resolveSrc("beep");
        if (!src) return;
        const audio = this.elements.get("beep");
        if (audio) {
            audio.src = src;
        } else {
            await this.ensureElement("beep");
        }
    }

    private async resolveSrc(key: SoundKey): Promise<string | undefined> {
        if (key === "beep") {
            const customBeepKey = getRenderSettings().customBeepSoundKey;
            if (typeof customBeepKey === "string" && customBeepKey) {
                const sound = await getCustomSound(customBeepKey);
                if (sound) return sound.data;
            }
            const { beepSound } = await import("./sounds");
            return beepSound as unknown as string;
        }
        const sound = await getCustomSound(key);
        return sound?.data;
    }

    private async getAllKnownSoundKeys(): Promise<Set<SoundKey>> {
        const keys = new Set<SoundKey>(["beep"]);
        try {
            const customSounds = await getCustomSounds();
            customSounds.forEach(s => keys.add(s.key));

            const render = getRenderSettings();
            const customBeepKey = render.customBeepSoundKey;
            if (typeof customBeepKey === "string" && customBeepKey) {
                keys.add(customBeepKey);
            }

            const triggers = globalStorage.get("triggers") ?? [];
            triggers.forEach((trigger: any) => {
                trigger?.macros?.forEach((macro: any) => {
                    if (macro?.type === "beep") {
                        keys.add(typeof macro.soundKey === "string" && macro.soundKey ? macro.soundKey : "beep");
                    }
                });
            });

            const soundCategories: SoundCategories = render.soundCategories ?? {};
            Object.values(soundCategories).forEach((key) => {
                if (typeof key === "string" && key) {
                    keys.add(key);
                }
            });
        } catch (error) {
            console.error("Failed to discover sounds", error);
        }
        return keys;
    }

    private play(key: SoundKey): void {
        if (this.muted) return;
        const cached = this.elements.get(key);
        if (cached) {
            this.playElement(cached, key);
            return;
        }
        // Cache miss — load then play. Loses user activation, so will only
        // work if the element was already primed somehow.
        void this.ensureElement(key).then(audio => {
            if (audio) this.playElement(audio, key);
        });
    }

    private playElement(audio: HTMLAudioElement, key: SoundKey): void {
        audio.volume = 1.0;
        audio.muted = false;
        try {
            audio.currentTime = 0;
        } catch {
            // ignore — readyState may be too low to seek
        }
        const result = audio.play();
        if (result && typeof result.then === 'function') {
            result.catch(err => {
                console.warn('[SoundManager] play failed for', key, err);
            });
        }
    }

    private playCategory(category: SoundCategory): void {
        if (this.muted) return;

        const soundCategories: SoundCategories = getRenderSettings().soundCategories ?? {};

        if (category in soundCategories) {
            const key = soundCategories[category];
            if (key === null) return;
            this.play(key);
        } else {
            this.play("beep");
        }
    }
}
