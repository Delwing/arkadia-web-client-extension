import {useCallback, useEffect, useMemo, useState} from "react";
import {Button, Form} from "react-bootstrap";
import storage, {getCurrentCharacter, getItemSync, setItemSync} from "@modules/core/storage";
import {
    DEFAULT_LUA_GAGS_DELETE_LINES,
    DEFAULT_LUA_GAGS_COLORS,
    LUA_GAG_LINE_TYPES,
    LUA_GAGS_STORAGE_KEY,
    LUA_GAGS_COLORS_STORAGE_KEY,
    LuaGagDeleteMode,
    LuaGagLineType,
    normalizeLuaGagsDeleteLines,
    normalizeLuaGagsColors,
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
    const [locked, setLocked] = useState(!getCurrentCharacter());
    const [deleteLines, setDeleteLines] = useState<DeleteLineState>(() => ({
        ...DEFAULT_LUA_GAGS_DELETE_LINES,
    }));
    const [colors, setColors] = useState<ColorState>(() => ({
        ...DEFAULT_LUA_GAGS_COLORS,
    }));

    useEffect(() => {
        const update = () => setLocked(!getCurrentCharacter());
        storage.onChanged?.addListener(update);
        window.addEventListener("storage", update);
        return () => {
            storage.onChanged?.removeListener?.(update);
            window.removeEventListener("storage", update);
        };
    }, []);

    const loadFromStorage = useCallback(() => {
        setDeleteLines(normalizeLuaGagsDeleteLines(getItemSync(LUA_GAGS_STORAGE_KEY)?.[LUA_GAGS_STORAGE_KEY]));
        setColors(normalizeLuaGagsColors(getItemSync(LUA_GAGS_COLORS_STORAGE_KEY)?.[LUA_GAGS_COLORS_STORAGE_KEY]));
    }, []);

    useEffect(() => {
        loadFromStorage();
        const listener = (changes: { [key: string]: { oldValue: any; newValue: any } }) => {
            if (changes[LUA_GAGS_STORAGE_KEY]) {
                setDeleteLines(
                    normalizeLuaGagsDeleteLines(changes[LUA_GAGS_STORAGE_KEY].newValue),
                );
            }
            if (changes[LUA_GAGS_COLORS_STORAGE_KEY]) {
                setColors(
                    normalizeLuaGagsColors(changes[LUA_GAGS_COLORS_STORAGE_KEY].newValue),
                );
            }
        };
        storage.onChanged?.addListener(listener);
        return () => {
            storage.onChanged?.removeListener?.(listener);
        };
    }, [loadFromStorage]);

    useEffect(() => {
        registerSave((_sharedSettings: Settings) => {
            setItemSync(LUA_GAGS_STORAGE_KEY, deleteLines);
            setItemSync(LUA_GAGS_COLORS_STORAGE_KEY, colors);
        });
    }, [registerSave, deleteLines, colors]);

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
        <div className="p-2 h-100">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="character-settings-layout">
                    <section className="character-settings-section character-settings-section--full">
                        <h5 className="character-settings-section-title">Ustawienia walki</h5>
                        <div className="character-settings-stack">
                            {LUA_GAG_LINE_TYPES.map(key => (
                                <Form.Group
                                    key={key}
                                    className="d-flex flex-wrap align-items-center justify-content-between gap-2"
                                    controlId={`luaGag-${key}`}
                                >
                                    <Form.Label className="mb-0 me-2">{labels[key]}</Form.Label>
                                    <div className="d-flex gap-2 align-items-center">
                                        <Form.Select
                                            size="sm"
                                            className="w-auto"
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
                                        </Form.Select>
                                        <Form.Control
                                            type="color"
                                            size="sm"
                                            value={colors[key]}
                                            onChange={event => handleColorChange(key, event.target.value)}
                                            style={{width: "50px"}}
                                            title="Kolor prefixu"
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline-secondary"
                                            onClick={() => resetColorToDefault(key)}
                                            title="Przywróć domyślny kolor"
                                            style={{padding: "0.25rem 0.5rem"}}
                                        >
                                            ↺
                                        </Button>
                                    </div>
                                </Form.Group>
                            ))}
                        </div>
                    </section>
                </div>
            </fieldset>
        </div>
    );
}

export default LuaGagsSettings;
