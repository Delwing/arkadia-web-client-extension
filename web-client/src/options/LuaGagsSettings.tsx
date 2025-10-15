import { useCallback, useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import storage, { getCurrentCharacter } from "@client/src/storage";
import {
    DEFAULT_LUA_GAGS_DELETE_LINES,
    LUA_GAG_LINE_TYPES,
    LUA_GAGS_STORAGE_KEY,
    LuaGagDeleteMode,
    LuaGagLineType,
    normalizeLuaGagsDeleteLines,
} from "@client/src/luaGagsSettings";

type RegisterSave = (cb: () => void) => void;

type DeleteLineState = Record<LuaGagLineType, LuaGagDeleteMode>;

const selectOptions = [
    { value: 0 as LuaGagDeleteMode, label: "0 - Leave line as is" },
    { value: 1 as LuaGagDeleteMode, label: "1 - Delete line" },
    { value: 2 as LuaGagDeleteMode, label: "2 - Prefix" },
];

function formatLabel(key: LuaGagLineType): string {
    return key
        .split("_")
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function LuaGagsSettings({ registerSave }: { registerSave: RegisterSave }) {
    const [locked, setLocked] = useState(!getCurrentCharacter());
    const [deleteLines, setDeleteLines] = useState<DeleteLineState>(() => ({
        ...DEFAULT_LUA_GAGS_DELETE_LINES,
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
        storage.getItem(LUA_GAGS_STORAGE_KEY).then(res => {
            const stored = res?.[LUA_GAGS_STORAGE_KEY];
            setDeleteLines(normalizeLuaGagsDeleteLines(stored));
        });
    }, []);

    useEffect(() => {
        loadFromStorage();
        const listener = (changes: { [key: string]: { oldValue: any; newValue: any } }) => {
            if (changes[LUA_GAGS_STORAGE_KEY]) {
                setDeleteLines(
                    normalizeLuaGagsDeleteLines(changes[LUA_GAGS_STORAGE_KEY].newValue),
                );
            }
        };
        storage.onChanged?.addListener(listener);
        return () => {
            storage.onChanged?.removeListener?.(listener);
        };
    }, [loadFromStorage]);

    useEffect(() => {
        registerSave(() => storage.setItem(LUA_GAGS_STORAGE_KEY, deleteLines));
    }, [registerSave, deleteLines]);

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

    return (
        <div className="p-2">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="mb-4 border rounded p-3">
                    <h5 className="fw-bold mb-3">Ustawienia walki</h5>
                    <div className="d-flex flex-column gap-3">
                        {LUA_GAG_LINE_TYPES.map(key => (
                            <Form.Group
                                key={key}
                                className="d-flex flex-wrap align-items-center justify-content-between gap-2"
                                controlId={`luaGag-${key}`}
                            >
                                <Form.Label className="mb-0 me-2">{labels[key]}</Form.Label>
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
                            </Form.Group>
                        ))}
                    </div>
                </div>
            </fieldset>
        </div>
    );
}

export default LuaGagsSettings;
