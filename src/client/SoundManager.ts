import type {Howl, Howler as HowlerType} from "howler";
import storage from "@modules/core/storage";
import { getCustomSound } from "@modules/core/customSounds";
import type Client from "./Client";

export type SoundKey = string;

// Global reference to Howler for audio context management
let howlerGlobal: typeof HowlerType | null = null;

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
    private howlConstructorPromise: Promise<typeof import('howler').Howl> | null = null;

    constructor(private readonly client: Client) {
        this.client.on("sound:play", ({ key }) => {
            if (typeof key === "string" && key) {
                void this.play(key);
            }
        });
    }

    async prepare(): Promise<void> {
        const keys = await this.getKeysToPreload();
        await Promise.all(
            Array.from(keys).map(async key => {
                const sound = await this.ensureSound(key);
                sound?.load();
            })
        );
    }

    private async getKeysToPreload(): Promise<Set<SoundKey>> {
        const keys = new Set<SoundKey>(["beep"]);
        try {
            const uiSettingsResult = await storage.getItem("uiSettings");
            const customBeepKey = (uiSettingsResult as any)?.uiSettings?.customBeepSoundKey;
            if (typeof customBeepKey === "string" && customBeepKey) {
                keys.add(customBeepKey);
            }

            const result = await storage.getItem("triggers");
            const triggers = Array.isArray((result as any)?.triggers) ? (result as any).triggers : [];
            triggers.forEach((trigger: any) => {
                trigger?.macros?.forEach((macro: any) => {
                    if (macro?.type === "beep") {
                        keys.add(typeof macro.soundKey === "string" && macro.soundKey ? macro.soundKey : "beep");
                    }
                });
            });
        } catch (error) {
            console.error("Failed to determine sounds to preload", error);
        }
        return keys;
    }

    private async loadHowler(): Promise<typeof import('howler').Howl> {
        if (!this.howlConstructorPromise) {
            this.howlConstructorPromise = import('howler').then((module: any) => {
                // Capture the global Howler reference for audio context management
                if (module?.Howler) {
                    howlerGlobal = module.Howler;
                } else if (module?.default?.Howler) {
                    howlerGlobal = module.default.Howler;
                }
                const constructor = module?.Howl ?? module?.default?.Howl ?? module?.default ?? module;
                return constructor as typeof import('howler').Howl;
            });
        }
        return this.howlConstructorPromise;
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
                const uiSettingsResult = await storage.getItem("uiSettings");
                const customBeepKey = (uiSettingsResult as any)?.uiSettings?.customBeepSoundKey;
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
}
