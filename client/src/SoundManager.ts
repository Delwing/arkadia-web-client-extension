import type {Howl} from "howler";
import storage from "./storage";
import { getCustomSound, getCustomSoundSync } from "./customSounds";

export type SoundKey = string;

interface PlaySoundDetail {
    key: SoundKey;
}

export default class SoundManager {
    private sounds: Partial<Record<SoundKey, Howl>> = {};
    private soundLoaders: Partial<Record<SoundKey, Promise<Howl | undefined>>> = {};
    private howlConstructorPromise: Promise<typeof import('howler').Howl> | null = null;
    private readonly playHandler: (event: Event) => void;

    constructor(private readonly eventTarget: EventTarget) {
        this.playHandler = (event: Event) => {
            const detail = (event as CustomEvent<PlaySoundDetail>).detail;
            const key = detail?.key;
            if (!key) {
                return;
            }
            void this.play(key);
        };
        this.eventTarget.addEventListener("sound:play", this.playHandler as EventListener);
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
        const definition = getCustomSoundSync(key) ?? await getCustomSound(key);
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
