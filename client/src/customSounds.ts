import storage, { getItemSync } from "./storage";

export const CUSTOM_SOUNDS_STORAGE_KEY = "custom_sounds";

export interface CustomSound {
    key: string;
    name: string;
    data: string;
}

function normalizeSounds(value: unknown): CustomSound[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item): item is CustomSound => {
        return item && typeof item === "object" && typeof (item as any).key === "string" && typeof (item as any).data === "string" && typeof (item as any).name === "string";
    });
}

export async function getCustomSounds(): Promise<CustomSound[]> {
    const result = await storage.getItem(CUSTOM_SOUNDS_STORAGE_KEY);
    if (!result) {
        return [];
    }
    return normalizeSounds((result as any)[CUSTOM_SOUNDS_STORAGE_KEY]);
}

export function getCustomSoundsSync(): CustomSound[] {
    const result = getItemSync(CUSTOM_SOUNDS_STORAGE_KEY);
    if (!result) {
        return [];
    }
    return normalizeSounds((result as any)[CUSTOM_SOUNDS_STORAGE_KEY]);
}

export async function saveCustomSounds(sounds: CustomSound[]): Promise<void> {
    await storage.setItem(CUSTOM_SOUNDS_STORAGE_KEY, sounds);
}

export async function getCustomSound(key: string): Promise<CustomSound | undefined> {
    const sounds = await getCustomSounds();
    return sounds.find(sound => sound.key === key);
}

export function getCustomSoundSync(key: string): CustomSound | undefined {
    const sounds = getCustomSoundsSync();
    return sounds.find(sound => sound.key === key);
}
