import {useCallback, useEffect, useState} from "react";
import {characterStorage} from "@modules/core/storage";
import {defaultSettings} from "./defaultSettings";
import type {Settings} from "./defaultSettings";

export interface GeneralSettingsSectionProps {
    settings: Settings;
    onChangeSetting: (modifier: (settings: Settings) => void) => void;
}

function normalizeCollectMode(value: any): number {
    const parsed = Number(value);
    const numeric = Number.isFinite(parsed) ? Math.round(parsed) : defaultSettings.collectMode;
    if (numeric < 1 || numeric > 4) {
        return 1;
    }
    return numeric;
}

function normalizeSettingsValue(saved: any): Settings {
    const merged: any = Object.assign({}, defaultSettings, saved ?? {});

    merged.collectMode = normalizeCollectMode(merged.collectMode);
    merged.collectCopper = !!merged.collectCopper;
    merged.collectSilver = !!merged.collectSilver;
    merged.collectGold = !!merged.collectGold;
    merged.collectGems = !!merged.collectGems;

    if (!Array.isArray(merged.collectOverrides)) {
        merged.collectOverrides = defaultSettings.collectOverrides;
    }

    if (typeof merged.lowHpAlert !== 'number') {
        merged.lowHpAlert = merged.lowHpAlert ? 2 : 0;
    }

    return merged as Settings;
}

/**
 * Form state for the character's `settings` fields edited by the sections in
 * Settings.tsx. Those sections are spread over several pages ("Ogólne",
 * "Przedmioty", "Walka"), so the state lives here, once, and each section only
 * renders it — a copy per page would have each save overwrite the others' edits.
 */
export function useGeneralSettingsForm(registerSave: (cb: (sharedSettings: Settings) => void) => void) {
    const [settings, setSettings] = useState<Settings>({...defaultSettings});

    const onChangeSetting = useCallback((modifier: (settings: Settings) => void) => {
        setSettings(prev => {
            const updated = {...prev};
            modifier(updated);
            return updated;
        });
    }, []);

    useEffect(() => {
        registerSave((sharedSettings: Settings) => {
            // Update the shared settings object with our values
            Object.assign(sharedSettings, settings);
        });
    }, [registerSave, settings]);

    const reload = useCallback(() => {
        setSettings(normalizeSettingsValue(characterStorage.get("settings")));
    }, []);

    useEffect(() => {
        reload();
        return characterStorage.onChange('settings', reload);
    }, [reload]);

    return {settings, onChangeSetting, reload};
}
