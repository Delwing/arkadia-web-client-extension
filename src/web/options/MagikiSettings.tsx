import { useState, useEffect, useCallback, useRef } from "react";
import { Form, Badge } from "react-bootstrap";
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
    const [magicTypes, setMagicTypes] = useState<string[]>([]);
    const [allMagics, setAllMagics] = useState<string[]>([]);
    const [searchInput, setSearchInput] = useState<string>("");
    const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
    const [loaded, setLoaded] = useState<boolean>(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const char = characterStorage.getCharacter();
        if (!char) return;

        const loadSettings = () => {
            const settings = (characterStorage.get("settings") || {}) as BaseSettings;
            setFavoriteMagicTypes(settings.favoriteMagicTypes || []);
            setFavoriteMagics(settings.favoriteMagicKeys || []);
            setLoaded(true);
        };

        loadSettings();

        const unsub = characterStorage.onChange('settings', () => {
            loadSettings();
        });

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
            unsub();
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
            // Only overwrite if settings have been loaded to prevent race condition
            if (loaded) {
                settings.favoriteMagicTypes = favoriteMagicTypes;
                settings.favoriteMagicKeys = favoriteMagics;
            }
        });
    }, [registerSave, favoriteMagicTypes, favoriteMagics, loaded]);

    const [locked, setLocked] = useState(!characterStorage.getCharacter());

    useEffect(() => {
        const update = () => setLocked(!characterStorage.getCharacter());
        return characterStorage.onCharacterChange(update);
    }, []);

    return (
        <div className="p-2 h-100">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="character-settings-layout">
                    <section className="character-settings-section character-settings-section--full">
                        <h5 className="character-settings-section-title">Ulubione magiki</h5>
                        <p className="text-muted small mb-3">
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
                                                    e.currentTarget.classList.add("text-white");
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.classList.remove("bg-primary");
                                                    e.currentTarget.classList.remove("text-white");
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
                                                    color: "white",
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
