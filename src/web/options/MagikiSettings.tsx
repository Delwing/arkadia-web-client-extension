import { useState, useEffect, useCallback, useRef } from "react";
import { Icon, Input } from "@design";
import { CheckboxField, ColorField, SettingsCard, SettingsHint } from "@web/settings/controls.tsx";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "./defaultSettings";
import type { Settings as BaseSettings } from "./defaultSettings";
import { subscribeToMagicTypes, subscribeToMagicKeys } from "@client/scripts/magicsLoader";
import "./magikiSettings.css";

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
    const inputRef = useRef<HTMLInputElement>(null);

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

    return (
        <>
            <SettingsCard title="Kolory">
                <ColorField
                    id="magics-color"
                    label="Magiki"
                    value={magicsColor}
                    onChange={setMagicsColor}
                    onReset={() => setMagicsColor(defaultSettings.magicsColor!)}
                />
                <ColorField
                    id="magic-keys-color"
                    label="Klucze"
                    value={magicKeysColor}
                    onChange={setMagicKeysColor}
                    onReset={() => setMagicKeysColor(defaultSettings.magicKeysColor!)}
                />
            </SettingsCard>

            <SettingsCard title="Ulubione magiki" full>
                <SettingsHint>
                    Wybierz ulubione typy magików lub dodaj konkretne magiki. Będą one oznaczone zieloną gwiazdką w pojemnikach.
                </SettingsHint>

                <div className="settings-field">
                    <span className="settings-field__label">Konkretne magiki</span>
                    <div className="magiki-suggest" data-settings-ignore>
                        <Input
                            ref={inputRef}
                            type="text"
                            placeholder="Wpisz nazwę magika..."
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
                            <div className="magiki-suggest__list">
                                {filteredSuggestions.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        className="magiki-suggest__item"
                                        // mousedown, not click: the field's blur would close the
                                        // list before a click ever landed on it.
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
                        <div className="magiki-chips">
                            {favoriteMagics.map((magic) => (
                                <span key={magic} className="magiki-chip">
                                    {magic}
                                    <button
                                        type="button"
                                        className="magiki-chip__remove"
                                        title={`Usuń ${magic}`}
                                        onClick={() => handleRemoveMagic(magic)}
                                    >
                                        <Icon name="close" size={12} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="settings-field">
                    <span className="settings-field__label">Typy magików</span>
                    {magicTypes.length === 0 ? (
                        <SettingsHint>Ładowanie typów magików...</SettingsHint>
                    ) : (
                        <div className="magiki-types">
                            {magicTypes.map((type) => (
                                <CheckboxField
                                    key={type}
                                    id={`magic-type-${type}`}
                                    label={type}
                                    checked={favoriteMagicTypes.includes(type)}
                                    onChange={() => handleToggleMagicType(type)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </SettingsCard>
        </>
    );
}

export default MagikiSettings;
