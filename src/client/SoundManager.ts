import type {Howl, Howler as HowlerType} from "howler";
import { globalStorage } from "@modules/core/storage";
import { getCustomSound } from "@modules/core/customSounds";
import type Client from "./Client";
import type { SoundCategory } from '@shared/events/clientEvents.ts';
import type { SoundCategories } from '@web/defaultUiSettings.ts';

export type SoundKey = string;

// Global reference to Howler for audio context management
let howlerGlobal: typeof HowlerType | null = null;
let howlerModulePromise: Promise<typeof import('howler').Howl> | null = null;

function loadHowlerModule(): Promise<typeof import('howler').Howl> {
    if (!howlerModulePromise) {
        howlerModulePromise = import('howler').then((module: any) => {
            if (module?.Howler) {
                howlerGlobal = module.Howler;
            } else if (module?.default?.Howler) {
                howlerGlobal = module.default.Howler;
            }
            // Disable auto-suspend to prevent audio context from being suspended after inactivity
            if (howlerGlobal) {
                (howlerGlobal as any).autoSuspend = false;
            }
            // Try to resume immediately after loading (may work if close to a user gesture)
            resumeAudioContext();
            const constructor = module?.Howl ?? module?.default?.Howl ?? module?.default ?? module;
            return constructor as typeof import('howler').Howl;
        });
    }
    return howlerModulePromise;
}

/**
 * Start loading Howler eagerly so that the AudioContext exists
 * before the user clicks connect. Call this on first user interaction.
 */
export function preloadHowler(): void {
    void loadHowlerModule();
}

/**
 * Resume the audio context if it's suspended.
 * Should be called on user interaction to ensure sounds can play.
 */
export function resumeAudioContext(): void {
    if (!howlerGlobal) return;
    const ctx = (howlerGlobal as any).ctx as AudioContext | undefined;
    if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch((err: unknown) => {
            console.warn('Failed to resume audio context:', err);
        });
    }
}

export default class SoundManager {
    private sounds: Partial<Record<SoundKey, Howl>> = {};
    private soundLoaders: Partial<Record<SoundKey, Promise<Howl | undefined>>> = {};
    private muted = false;

    constructor(private readonly client: Client) {
        this.client.on("sound:play", ({ key }) => {
            if (typeof key === "string" && key) {
                void this.play(key);
            }
        });
        this.client.on("sound:category", (category) => {
            void this.playCategory(category);
        });
    }

    get isMuted(): boolean {
        return this.muted;
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
        const keys = this.getKeysToPreload();
        await Promise.all(
            Array.from(keys).map(async key => {
                const sound = await this.ensureSound(key);
                sound?.load();
            })
        );
        // Play a near-silent sound to unlock the browser audio context
        this.playSilent();
    }

    private async playSilent(): Promise<void> {
        try {
            const HowlConstructor = await this.loadHowler();
            const silent = new HowlConstructor({
                src: ['data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='],
                volume: 0.01,
                preload: true,
                onload() {
                    silent.play();
                },
            });
        } catch {
            // best-effort unlock
        }
    }

    private getKeysToPreload(): Set<SoundKey> {
        const keys = new Set<SoundKey>(["beep"]);
        try {
            const uiSettings = globalStorage.get("uiSettings");
            const customBeepKey = (uiSettings as any)?.customBeepSoundKey;
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

            const soundCategories: SoundCategories = (uiSettings as any)?.soundCategories ?? {};
            Object.values(soundCategories).forEach((key) => {
                if (typeof key === "string" && key) {
                    keys.add(key);
                }
            });
        } catch (error) {
            console.error("Failed to determine sounds to preload", error);
        }
        return keys;
    }

    private loadHowler(): Promise<typeof import('howler').Howl> {
        return loadHowlerModule();
    }

    private async ensureSound(key: SoundKey): Promise<Howl | undefined> {
        const existing = this.sounds[key];
        if (existing) {
            return existing;
        }
        if (!this.soundLoaders[key]) {
            this.soundLoaders[key] = this.createSound(key);
        }
        return this.soundLoaders[key];
    }

    private async createSound(key: SoundKey): Promise<Howl | undefined> {
        const HowlConstructor = await this.loadHowler();
        switch (key) {
            case "beep": {
                const uiSettings = globalStorage.get("uiSettings");
                const customBeepKey = (uiSettings as any)?.customBeepSoundKey;
                if (typeof customBeepKey === "string" && customBeepKey) {
                    return this.createCustomSound(HowlConstructor, customBeepKey);
                }
                const {beepSound} = await import("./sounds");
                const sound = new HowlConstructor({
                    src: beepSound,
                    preload: false,
                });
                this.sounds[key] = sound;
                return sound;
            }
            default:
                return this.createCustomSound(HowlConstructor, key);
        }
    }

    private async createCustomSound(HowlConstructor: typeof import("howler").Howl, key: SoundKey): Promise<Howl | undefined> {
        const definition = await getCustomSound(key);
        if (!definition) {
            return undefined;
        }
        const sound = new HowlConstructor({
            src: [definition.data],
            preload: false,
        });
        this.sounds[key] = sound;
        return sound;
    }

    private playLoadedSound(sound: Howl) {
        const play = () => {
            sound.stop();
            sound.play();
        };
        if (sound.state() === 'loaded') {
            play();
        } else {
            sound.once('load', play);
            sound.load();
        }
    }

    private async play(key: SoundKey) {
        if (this.muted) return;

        // Resume audio context if suspended (browser autoplay policy)
        resumeAudioContext();

        const existing = this.sounds[key];
        if (existing) {
            this.playLoadedSound(existing);
            return;
        }
        try {
            const sound = await this.ensureSound(key);
            if (sound) {
                this.playLoadedSound(sound);
            }
        } catch (error) {
            console.error("Failed to play sound", error);
        }
    }

    private async playCategory(category: SoundCategory): Promise<void> {
        if (this.muted) return;

        resumeAudioContext();

        const uiSettings = globalStorage.get("uiSettings");
        const soundCategories: SoundCategories = (uiSettings as any)?.soundCategories ?? {};

        if (category in soundCategories) {
            const key = soundCategories[category];
            if (key === null) return; // disabled — silence
            void this.play(key);     // custom sound
        } else {
            void this.play("beep");  // default beep (respects customBeepSoundKey)
        }
    }
}
