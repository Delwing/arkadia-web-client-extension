import {useCallback, useEffect, useMemo, useState} from "react";
import {Button} from "@design";
import {SettingsCard, TextField} from "@web/settings/controls.tsx";
import {characterStorage} from "@modules/core/storage";
import {
    DEFAULT_LUA_GAGS_DELETE_LINES,
    DEFAULT_LUA_GAGS_COLORS,
    DEFAULT_LUA_GAGS_WALKA_CONFIG,
    LUA_GAG_LINE_TYPES,
    LUA_GAGS_STORAGE_KEY,
    LUA_GAGS_COLORS_STORAGE_KEY,
    LUA_GAGS_WALKA_CONFIG_STORAGE_KEY,
    LuaGagDeleteMode,
    LuaGagLineType,
    LuaGagsWalkaConfig,
    normalizeLuaGagsDeleteLines,
    normalizeLuaGagsColors,
    normalizeLuaGagsWalkaConfig,
} from "@client/luaGagsSettings";

import {Settings} from "./defaultSettings";

type RegisterSave = (cb: (sharedSettings: Settings) => void) => void;

type DeleteLineState = Record<LuaGagLineType, LuaGagDeleteMode>;
type ColorState = Record<LuaGagLineType, string>;

const selectOptions = [
    {value: 0 as LuaGagDeleteMode, label: "Pozostaw linię"},
    {value: 1 as LuaGagDeleteMode, label: "Usuń linię"},
    {value: 2 as LuaGagDeleteMode, label: "Dodaj prefiks"},
];

function formatLabel(key: LuaGagLineType): string {
    return key
        .split("_")
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function LuaGagsSettings({registerSave}: { registerSave: RegisterSave }) {
    const [deleteLines, setDeleteLines] = useState<DeleteLineState>(() => ({
        ...DEFAULT_LUA_GAGS_DELETE_LINES,
    }));
    const [colors, setColors] = useState<ColorState>(() => ({
        ...DEFAULT_LUA_GAGS_COLORS,
    }));
    const [walkaConfig, setWalkaConfig] = useState<LuaGagsWalkaConfig>(() => ({
        ...DEFAULT_LUA_GAGS_WALKA_CONFIG,
    }));

    const loadFromStorage = useCallback(() => {
        setDeleteLines(normalizeLuaGagsDeleteLines(characterStorage.get(LUA_GAGS_STORAGE_KEY as 'lua_gags_delete_lines')));
        setColors(normalizeLuaGagsColors(characterStorage.get(LUA_GAGS_COLORS_STORAGE_KEY as 'lua_gags_colors')));
        setWalkaConfig(normalizeLuaGagsWalkaConfig(characterStorage.get(LUA_GAGS_WALKA_CONFIG_STORAGE_KEY as 'lua_gags_walka_config')));
    }, []);

    useEffect(() => {
        loadFromStorage();
        const unsub1 = characterStorage.onChange('lua_gags_delete_lines', (newValue) => {
            setDeleteLines(normalizeLuaGagsDeleteLines(newValue));
        });
        const unsub2 = characterStorage.onChange('lua_gags_colors', (newValue) => {
            setColors(normalizeLuaGagsColors(newValue));
        });
        const unsub3 = characterStorage.onChange('lua_gags_walka_config', (newValue) => {
            setWalkaConfig(normalizeLuaGagsWalkaConfig(newValue));
        });
        return () => {
            unsub1();
            unsub2();
            unsub3();
        };
    }, [loadFromStorage]);

    useEffect(() => {
        registerSave((_sharedSettings: Settings) => {
            characterStorage.set('lua_gags_delete_lines', deleteLines);
            characterStorage.set('lua_gags_colors', colors);
            characterStorage.set('lua_gags_walka_config', walkaConfig);
        });
    }, [registerSave, deleteLines, colors, walkaConfig]);

    const labels = useMemo(() => {
        const map: Record<LuaGagLineType, string> = {} as Record<LuaGagLineType, string>;
        LUA_GAG_LINE_TYPES.forEach(key => {
            map[key] = formatLabel(key);
        });
        return map;
    }, []);

    const handleChange = (key: LuaGagLineType, value: LuaGagDeleteMode) => {
        setDeleteLines(prev => {
            if (prev[key] === value) {
                return prev;
            }
            return {
                ...prev,
                [key]: value,
            };
        });
    };

    const handleColorChange = (key: LuaGagLineType, value: string) => {
        setColors(prev => {
            if (prev[key] === value) {
                return prev;
            }
            return {
                ...prev,
                [key]: value,
            };
        });
    };

    const resetColorToDefault = (key: LuaGagLineType) => {
        handleColorChange(key, DEFAULT_LUA_GAGS_COLORS[key]);
    };

    return (
        <>
            <SettingsCard title="Prefiksy" full>
                <TextField
                    id="walka-ownSpecPrefix"
                    label="Prefiks moje spece"
                    value={walkaConfig.ownSpecPrefix}
                    onChange={value => setWalkaConfig(prev => ({...prev, ownSpecPrefix: value}))}
                />
                <TextField
                    id="walka-finPrefix"
                    label="Prefiks finishera"
                    value={walkaConfig.finPrefix}
                    placeholder="FIN"
                    onChange={value => setWalkaConfig(prev => ({...prev, finPrefix: value}))}
                />
            </SettingsCard>
            <SettingsCard title="Ustawienia walki" full>
                {LUA_GAG_LINE_TYPES.map(key => (
                    <div className="settings-row" key={key}>
                        <label className="settings-row__label" htmlFor={`luaGag-${key}`}>{labels[key]}</label>
                        {/* The select, the swatch and the reset button share one
                            parent on purpose: lua-gags-settings.spec.ts reaches
                            the button as the select's sibling. */}
                        <div className="settings-row__controls">
                            <select
                                id={`luaGag-${key}`}
                                className="settings-native-select"
                                value={deleteLines[key]}
                                onChange={event => handleChange(key, Number(event.target.value) as LuaGagDeleteMode)}
                            >
                                {selectOptions.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <input
                                id={`luaGag-${key}-color`}
                                type="color"
                                className="settings-color"
                                value={colors[key]}
                                title="Kolor prefixu"
                                onChange={event => handleColorChange(key, event.target.value)}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                title="Przywróć domyślny kolor"
                                onClick={() => resetColorToDefault(key)}
                            >
                                {'↺'}
                            </Button>
                        </div>
                    </div>
                ))}
            </SettingsCard>
        </>
    );
}

export default LuaGagsSettings;
