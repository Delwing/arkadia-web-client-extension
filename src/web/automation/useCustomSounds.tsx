import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { globalStorage } from "@modules/core/storage";
import { CustomSound, getCustomSounds, saveCustomSounds } from "@modules/core/customSounds";
import {
    getRegisteredTriggerMacros,
    type PluginTriggerMacro,
} from "@modules/core/pluginTriggerMacroRegistry";
import eventBus from "@modules/core/eventBus";

/**
 * The player's custom sounds, and a way to add one from a file for the sound
 * action. Render `soundInput` once; `requestSoundUpload` opens its picker and
 * resolves with the new sound's key, or undefined when cancelled.
 */
export function useCustomSounds() {
    const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const pendingSoundResolver = useRef<((value?: string) => void) | null>(null);
    const customSoundsRef = useRef<CustomSound[]>([]);

    useEffect(() => {
        customSoundsRef.current = customSounds;
    }, [customSounds]);

    useEffect(() => {
        let active = true;
        getCustomSounds().then(list => {
            if (active) {
                setCustomSounds(list);
            }
        });
        const unsub = globalStorage.onChange('custom_sounds', () => {
            if (!active) return;
            getCustomSounds().then(sounds => {
                if (active) {
                    setCustomSounds(sounds);
                }
            });
        });
        return () => {
            active = false;
            unsub();
            pendingSoundResolver.current?.(undefined);
            pendingSoundResolver.current = null;
        };
    }, []);

    function requestSoundUpload(): Promise<string | undefined> {
        return new Promise(resolve => {
            if (pendingSoundResolver.current) {
                pendingSoundResolver.current(undefined);
            }
            pendingSoundResolver.current = resolve;
            fileInputRef.current?.click();
        });
    }

    function handleSoundFileChange(e: ChangeEvent<HTMLInputElement>) {
        const resolver = pendingSoundResolver.current;
        pendingSoundResolver.current = null;
        const file = e.target.files?.[0] ?? null;
        e.target.value = '';
        if (!file) {
            resolver?.(undefined);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                resolver?.(undefined);
                return;
            }
            const baseName = file.name.replace(/\.[^/.]+$/, '') || file.name;
            const existingKeys = new Set(customSoundsRef.current.map(sound => sound.key));
            const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const prefix = slug ? `user:${slug}` : `user:${Date.now()}`;
            let key = prefix;
            let counter = 1;
            while (existingKeys.has(key)) {
                key = `${prefix}-${counter++}`;
            }
            const sound: CustomSound = { key, name: baseName, data: result };
            const nextSounds = [...customSoundsRef.current, sound];
            customSoundsRef.current = nextSounds;
            setCustomSounds(nextSounds);
            void saveCustomSounds(nextSounds)
                .catch(error => {
                    console.error('Failed to save custom sound', error);
                })
                .finally(() => {
                    resolver?.(sound.key);
                });
        };
        reader.onerror = () => {
            resolver?.(undefined);
        };
        reader.readAsDataURL(file);
    }

    const soundInput = (
        <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={handleSoundFileChange} />
    );

    return { customSounds, requestSoundUpload, soundInput };
}

/** Trigger macros registered by the loaded plugins, kept current. */
export function usePluginMacros(): PluginTriggerMacro[] {
    const [pluginMacros, setPluginMacros] = useState<PluginTriggerMacro[]>([]);

    useEffect(() => {
        setPluginMacros(getRegisteredTriggerMacros());
        const handleMacrosChanged = () => {
            setPluginMacros(getRegisteredTriggerMacros());
        };
        eventBus.on('pluginTriggerMacrosChanged', handleMacrosChanged);
        return () => {
            eventBus.off('pluginTriggerMacrosChanged', handleMacrosChanged);
        };
    }, []);

    return pluginMacros;
}
