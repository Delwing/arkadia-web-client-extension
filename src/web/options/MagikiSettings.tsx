import { useState, useEffect, useCallback, useRef } from "react";
import { Form, Badge, Button } from "react-bootstrap";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "./defaultSettings";
import type { Settings as BaseSettings } from "./defaultSettings";
import { subscribeToMagicTypes, subscribeToMagicKeys } from "@client/scripts/lib/magicsLoader";

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

    const [locked, setLocked] = useState(!characterStorage.getCharacter());

    useEffect(() => {
        const update = () => setLocked(!characterStorage.getCharacter());
        return characterStorage.onCharacterChange(update);
    }, []);

    return (
        <div className="p-2 h-100">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="character-settings-layout">
                    <section className="character-settings-section">
                        <h5 className="character-settings-section-title">Kolory</h5>
                        <div className="d-flex align-items-center gap-2">
                            <Form.Label className="mb-0" htmlFor="magics-color">Magiki</Form.Label>
                            <Form.Control
                                type="color"
                                id="magics-color"
                                value={magicsColor}
                                onChange={(e) => setMagicsColor(e.target.value)}
                                className="form-control-color"
                                style={{ width: '3rem' }}
                            />
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                onClick={() => setMagicsColor(defaultSettings.magicsColor!)}
                                title="Przywróć domyślny kolor"
                                style={{ padding: "0.25rem 0.5rem" }}
                            >
                                ↺
                            </Button>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <Form.Label className="mb-0" htmlFor="magic-keys-color">Klucze</Form.Label>
                            <Form.Control
                                type="color"
                                id="magic-keys-color"
                                value={magicKeysColor}
                                onChange={(e) => setMagicKeysColor(e.target.value)}
                                className="form-control-color"
                                style={{ width: '3rem' }}
                            />
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                onClick={() => setMagicKeysColor(defaultSettings.magicKeysColor!)}
                                title="Przywróć domyślny kolor"
                                style={{ padding: "0.25rem 0.5rem" }}
                            >
                                ↺
                            </Button>
                        </div>
                    </section>

                    <section className="character-settings-section character-settings-section--full">
                        <h5 className="character-settings-section-title">Ulubione magiki</h5>
                        <p className="text-muted small mb-0">
                            Wybierz ulubione typy magików lub dodaj konkretne magiki. Będą one oznaczone zieloną gwiazdką w pojemnikach.
                        </p>

                        {/* Specific Magics Section */}
                        <div className="mb-4">
                            <h6 className="mb-2">Konkretne magiki</h6>
                            <div className="mb-2" style={{ position: "relative" }}>
                                <Form.Control
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
                                    <div
                                        className="bg-body border"
                                        style={{
                                            position: "absolute",
                                            top: "100%",
                                            left: 0,
                                            right: 0,
                                            borderTop: "none",
                                            borderRadius: "0 0 0.25rem 0.25rem",
                                            maxHeight: "200px",
                                            overflowY: "auto",
                                            zIndex: 1000,
                                            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                                        }}
                                    >
                                        {filteredSuggestions.map((suggestion) => (
                                            <div
                                                key={suggestion}
                                                className="border-bottom"
                                                style={{
                                                    padding: "0.5rem",
                                                    cursor: "pointer"
                                                }}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    handleAddMagic(suggestion);
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.classList.add("bg-primary");
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.classList.remove("bg-primary");
                                                }}
                                            >
                                                {suggestion}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {favoriteMagics.length > 0 && (
                                <div className="d-flex flex-wrap gap-2 mb-3">
                                    {favoriteMagics.map((magic) => (
                                        <Badge
                                            key={magic}
                                            bg="primary"
                                            className="d-flex align-items-center"
                                            style={{ fontSize: "0.9rem", padding: "0.4rem 0.6rem" }}
                                        >
                                            {magic}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveMagic(magic)}
                                                style={{
                                                    marginLeft: "0.5rem",
                                                    background: "none",
                                                    border: "none",
                                                    color: "inherit",
                                                    cursor: "pointer",
                                                    fontSize: "1.2rem",
                                                    lineHeight: "1",
                                                    padding: "0",
                                                    fontWeight: "bold"
                                                }}
                                            >
                                                ×
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Magic Types Section */}
                        <div>
                            <h6 className="mb-2">Typy magików</h6>
                            {magicTypes.length === 0 ? (
                                <p className="text-muted">Ładowanie typów magików...</p>
                            ) : (
                                <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                                    gap: "0.5rem"
                                }}>
                                    {magicTypes.map((type) => (
                                        <div key={type}>
                                            <Form.Check
                                                type="checkbox"
                                                id={`magic-type-${type}`}
                                                label={type}
                                                checked={favoriteMagicTypes.includes(type)}
                                                onChange={() => handleToggleMagicType(type)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </fieldset>
        </div>
    );
}

export default MagikiSettings;
