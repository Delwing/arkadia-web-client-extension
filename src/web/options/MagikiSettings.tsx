import { useState, useEffect, useCallback, useRef } from "react";
import { Button, Check, Field, Input } from "@web-ui/primitives/index.ts";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "./defaultSettings";
import type { Settings as BaseSettings } from "./defaultSettings";
import { subscribeToMagicTypes, subscribeToMagicKeys } from "@client/scripts/magicsLoader";

interface MagikiSettingsProps {
    registerSave: (fn: (settings: any) => void) => void;
}

function MagikiSettings({ registerSave }: MagikiSettingsProps) {
    const [favoriteMagicTypes, setFavoriteMagicTypes] = useState<string[]>(defaultSettings.favoriteMagicTypes || []);
    const [favoriteMagics, setFavoriteMagics] = useState<string[]>(defaultSettings.favoriteMagicKeys || []);
    const [magicsColor, setMagicsColor] = useState<string>(defaultSettings.magicsColor!);
    const [magicKeysColor, setMagicKeysColor] = useState<string>(defaultSettings.magicKeysColor!);
    const [magicTypes, setMagicTypes] = useState<string[]>([]);
    const [allMagics, setAllMagics] = useState<string[]>([]);
    const [searchInput, setSearchInput] = useState<string>("");
    const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
    const [loaded, setLoaded] = useState<boolean>(false);

    // Updated directly during render (not in useEffect) so the ref is always
    // current by the time any event handler reads it — avoids save-race condition.
    const saveStateRef = useRef({ favoriteMagicTypes, favoriteMagics, magicsColor, magicKeysColor, loaded });
    saveStateRef.current = { favoriteMagicTypes, favoriteMagics, magicsColor, magicKeysColor, loaded };

    useEffect(() => {
        const loadSettings = () => {
            if (!characterStorage.getCharacter()) return;
            const settings = (characterStorage.get("settings") || {}) as BaseSettings;
            setFavoriteMagicTypes(settings.favoriteMagicTypes || []);
            setFavoriteMagics(settings.favoriteMagicKeys || []);
            setMagicsColor(settings.magicsColor ?? defaultSettings.magicsColor!);
            setMagicKeysColor(settings.magicKeysColor ?? defaultSettings.magicKeysColor!);
            setLoaded(true);
        };

        loadSettings();

        const unsubSettings = characterStorage.onChange('settings', loadSettings);
        const unsubChar = characterStorage.onCharacterChange(loadSettings);

        const unsubscribeTypes = subscribeToMagicTypes((types) => {
            if (types) {
                setMagicTypes(types);
            }
        });

        const unsubscribeMagics = subscribeToMagicKeys((magics) => {
            if (magics) {
                setAllMagics(magics);
            }
        });

        return () => {
            unsubSettings();
            unsubChar();
            unsubscribeTypes();
            unsubscribeMagics();
        };
    }, []);

    const handleToggleMagicType = useCallback((type: string) => {
        setFavoriteMagicTypes((prev) => {
            if (prev.includes(type)) {
                return prev.filter((t) => t !== type);
            } else {
                return [...prev, type];
            }
        });
    }, []);

    const handleAddMagic = useCallback((magic: string) => {
        const trimmedMagic = magic.trim();
        if (trimmedMagic && !favoriteMagics.includes(trimmedMagic)) {
            setFavoriteMagics((prev) => [...prev, trimmedMagic]);
            setSearchInput("");
            setShowSuggestions(false);
        }
    }, [favoriteMagics]);

    const handleRemoveMagic = useCallback((magic: string) => {
        setFavoriteMagics((prev) => prev.filter((m) => m !== magic));
    }, []);

    const filteredSuggestions = allMagics.filter((magic) =>
        magic.toLowerCase().includes(searchInput.toLowerCase()) &&
        !favoriteMagics.includes(magic)
    ).slice(0, 10);

    useEffect(() => {
        registerSave((settings: any) => {
            const s = saveStateRef.current;
            if (s.loaded) {
                settings.favoriteMagicTypes = s.favoriteMagicTypes;
                settings.favoriteMagicKeys = s.favoriteMagics;
                settings.magicsColor = s.magicsColor;
                settings.magicKeysColor = s.magicKeysColor;
            }
        });
    }, [registerSave]);

    const colorRow = (id: string, label: string, value: string, set: (v: string) => void, fallback: string) => (
        <div className="settings-row">
            <label className="popup-field__label" htmlFor={id}>{label}</label>
            <div className="popup-inline">
                <input type="color" id={id} className="popup-color" value={value} onChange={(e) => set(e.target.value)}/>
                <Button size="sm" variant="ghost" onClick={() => set(fallback)} title="Przywróć domyślny kolor">↺</Button>
            </div>
        </div>
    );

    return (
        <>
            <section className="character-settings-section">
                <h5 className="character-settings-section-title">Kolory</h5>
                <div className="settings-rows">
                    {colorRow("magics-color", "Magiki", magicsColor, setMagicsColor, defaultSettings.magicsColor!)}
                    {colorRow("magic-keys-color", "Klucze", magicKeysColor, setMagicKeysColor, defaultSettings.magicKeysColor!)}
                </div>
            </section>

            <section className="character-settings-section character-settings-section--full">
                <h5 className="character-settings-section-title">Ulubione magiki</h5>
                <p className="popup-field__hint">
                    Wybierz ulubione typy magików lub dodaj konkretne magiki. Będą one oznaczone zieloną gwiazdką w pojemnikach.
                </p>

                <Field label="Konkretne magiki" htmlFor="favorite-magic-search">
                    <div className="settings-suggest-anchor" data-settings-ignore>
                        <Input
                            id="favorite-magic-search"
                            className="settings-command"
                            placeholder="Wpisz nazwę magika..."
                            autoComplete="off"
                            value={searchInput}
                            onChange={(e) => {
                                setSearchInput(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && filteredSuggestions.length > 0) {
                                    e.preventDefault();
                                    handleAddMagic(filteredSuggestions[0]);
                                }
                            }}
                        />
                        {showSuggestions && searchInput && filteredSuggestions.length > 0 && (
                            <div className="popup-menu settings-suggest">
                                {filteredSuggestions.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        className="popup-menu__item"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleAddMagic(suggestion);
                                        }}
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {favoriteMagics.length > 0 && (
                        <div className="settings-chip-list">
                            {favoriteMagics.map((magic) => (
                                <span
                                    key={magic}
                                    className="popup-chip"
                                    title="Usuń"
                                    onClick={() => handleRemoveMagic(magic)}
                                >
                                    {magic}
                                    <span className="popup-chip__remove">×</span>
                                </span>
                            ))}
                        </div>
                    )}
                </Field>

                <Field label="Typy magików">
                    {magicTypes.length === 0 ? (
                        <p className="popup-field__hint">Ładowanie typów magików...</p>
                    ) : (
                        <div className="settings-check-grid">
                            {magicTypes.map((type) => (
                                <Check
                                    key={type}
                                    id={`magic-type-${type}`}
                                    label={type}
                                    checked={favoriteMagicTypes.includes(type)}
                                    onChange={() => handleToggleMagicType(type)}
                                />
                            ))}
                        </div>
                    )}
                </Field>
            </section>
        </>
    );
}

export default MagikiSettings;
