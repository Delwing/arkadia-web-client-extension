import {useCallback, useEffect, useMemo, useState} from "react";
import {Button, Input, Select} from "@web-ui/primitives/index.ts";
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
            <section className="character-settings-section character-settings-section--full">
                <h5 className="character-settings-section-title">Prefiksy</h5>
                <div className="settings-rows">
                    <div className="settings-row">
                        <label className="popup-field__label" htmlFor="walka-ownSpecPrefix">Prefiks moje spece</label>
                        <Input
                            mono
                            id="walka-ownSpecPrefix"
                            className="settings-num"
                            value={walkaConfig.ownSpecPrefix}
                            onChange={e => setWalkaConfig(prev => ({...prev, ownSpecPrefix: e.target.value}))}
                        />
                    </div>
                    <div className="settings-row">
                        <label className="popup-field__label" htmlFor="walka-finPrefix">Prefiks finishera</label>
                        <Input
                            mono
                            id="walka-finPrefix"
                            className="settings-num"
                            value={walkaConfig.finPrefix}
                            placeholder="FIN"
                            onChange={e => setWalkaConfig(prev => ({...prev, finPrefix: e.target.value}))}
                        />
                    </div>
                </div>
            </section>
            <section className="character-settings-section character-settings-section--full">
                <h5 className="character-settings-section-title">Ustawienia walki</h5>
                <div className="settings-rows">
                    {LUA_GAG_LINE_TYPES.map(key => (
                        <div key={key} className="settings-row">
                            <label className="popup-field__label" htmlFor={`luaGag-${key}`}>{labels[key]}</label>
                            <div className="popup-inline">
                                <Select
                                    id={`luaGag-${key}`}
                                    className="settings-narrow"
                                    value={deleteLines[key]}
                                    onChange={event =>
                                        handleChange(key, Number(event.target.value) as LuaGagDeleteMode)
                                    }
                                >
                                    {selectOptions.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </Select>
                                <input
                                    type="color"
                                    id={`luaGag-${key}-color`}
                                    className="popup-color"
                                    value={colors[key]}
                                    onChange={event => handleColorChange(key, event.target.value)}
                                    title="Kolor prefixu"
                                />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => resetColorToDefault(key)}
                                    title="Przywróć domyślny kolor"
                                >
                                    ↺
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}

export default LuaGagsSettings;
