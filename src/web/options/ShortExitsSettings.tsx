import { useState, useEffect, useRef } from "react";
import { Form, Button } from "react-bootstrap";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "./defaultSettings";
import type { Settings as BaseSettings } from "./defaultSettings";

interface ShortExitsSettingsProps {
    registerSave: (fn: (settings: any) => void) => void;
}

const PRESET_FORMATS = [
    { label: 'Kompaktowy (-----:)', value: '-----:' },
    { label: 'Strzałka (→)', value: '→' },
    { label: 'Niestandardowy', value: 'custom' },
];

function ShortExitsSettings({ registerSave }: ShortExitsSettingsProps) {
    const [prefix, setPrefix] = useState<string>(defaultSettings.shortExitsPrefix ?? '-----:');
    const [color, setColor] = useState<string>(defaultSettings.shortExitsColor ?? '#ffa500');
    const [separator, setSeparator] = useState<string>(defaultSettings.shortExitsSeparator ?? ' ');
    const [customPrefix, setCustomPrefix] = useState<string>(prefix);
    const [presetFormat, setPresetFormat] = useState<string>(
        PRESET_FORMATS.find(p => p.value === prefix)?.value || 'custom'
    );
    const [loaded, setLoaded] = useState<boolean>(false);
    const [locked, setLocked] = useState(!characterStorage.getCharacter());

    const saveStateRef = useRef({ prefix, color, separator, loaded });
    saveStateRef.current = { prefix, color, separator, loaded };

    useEffect(() => {
        const loadSettings = () => {
            if (!characterStorage.getCharacter()) return;
            const settings = (characterStorage.get("settings") || {}) as BaseSettings;
            const loadedPrefix = settings.shortExitsPrefix ?? defaultSettings.shortExitsPrefix ?? '-----:';
            const loadedColor = settings.shortExitsColor ?? defaultSettings.shortExitsColor ?? '#ffa500';
            const loadedSeparator = settings.shortExitsSeparator ?? defaultSettings.shortExitsSeparator ?? ' ';

            setPrefix(loadedPrefix);
            setColor(loadedColor);
            setSeparator(loadedSeparator);
            setCustomPrefix(loadedPrefix);

            const matchedPreset = PRESET_FORMATS.find(p => p.value === loadedPrefix);
            setPresetFormat(matchedPreset?.value || 'custom');
            setLoaded(true);
        };

        loadSettings();
        const unsubSettings = characterStorage.onChange('settings', loadSettings);
        const unsubChar = characterStorage.onCharacterChange(loadSettings);

        return () => {
            unsubSettings();
            unsubChar();
        };
    }, []);

    useEffect(() => {
        const update = () => setLocked(!characterStorage.getCharacter());
        return characterStorage.onCharacterChange(update);
    }, []);

    useEffect(() => {
        if (presetFormat === 'custom') {
            setPrefix(customPrefix);
        } else {
            setPrefix(presetFormat);
            setCustomPrefix(presetFormat);
        }
    }, [presetFormat, customPrefix]);

    const handlePresetChange = (format: string) => {
        setPresetFormat(format);
        if (format !== 'custom') {
            setPrefix(format);
            setCustomPrefix(format);
        }
    };

    const handleCustomChange = (value: string) => {
        setCustomPrefix(value);
        setPrefix(value);
    };

    const handleReset = () => {
        setPrefix(defaultSettings.shortExitsPrefix ?? '-----:');
        setColor(defaultSettings.shortExitsColor ?? '#ffa500');
        setSeparator(defaultSettings.shortExitsSeparator ?? ' ');
        setCustomPrefix(defaultSettings.shortExitsPrefix ?? '-----:');
        const matchedPreset = PRESET_FORMATS.find(p => p.value === defaultSettings.shortExitsPrefix);
        setPresetFormat(matchedPreset?.value || 'custom');
    };

    const preview = `${prefix} N E NE`;

    useEffect(() => {
        registerSave((settings: any) => {
            const s = saveStateRef.current;
            if (s.loaded) {
                settings.shortExitsPrefix = s.prefix;
                settings.shortExitsColor = s.color;
                settings.shortExitsSeparator = s.separator;
            }
        });
    }, [registerSave]);

    return (
        <div className="p-2 h-100">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="character-settings-layout">
                    <section className="character-settings-section">
                        <h5 className="character-settings-section-title">Format wyjść</h5>

                        <div className="mb-3">
                            <Form.Label>Przedrostek</Form.Label>
                            <div className="d-flex flex-column gap-2">
                                {PRESET_FORMATS.map((format) => (
                                    <Form.Check
                                        key={format.value}
                                        type="radio"
                                        id={`format-${format.value}`}
                                        label={format.label}
                                        name="shortExitsFormat"
                                        value={format.value}
                                        checked={presetFormat === format.value}
                                        onChange={(e) => handlePresetChange(e.target.value)}
                                    />
                                ))}
                            </div>
                            {presetFormat === 'custom' && (
                                <div className="mt-2">
                                    <Form.Control
                                        type="text"
                                        value={customPrefix}
                                        onChange={(e) => handleCustomChange(e.target.value)}
                                        placeholder="np. >>>"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="mb-3">
                            <Form.Label htmlFor="separator">Separator</Form.Label>
                            <Form.Control
                                type="text"
                                id="separator"
                                value={separator}
                                onChange={(e) => setSeparator(e.target.value)}
                                placeholder=" "
                                maxLength={5}
                            />
                            <small className="text-muted">Tekst między kierunkami</small>
                        </div>

                        <div className="mb-3">
                            <div className="d-flex align-items-center gap-2">
                                <Form.Label className="mb-0" htmlFor="exits-color">Kolor</Form.Label>
                                <Form.Control
                                    type="color"
                                    id="exits-color"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    className="form-control-color"
                                    style={{ width: '3rem' }}
                                />
                                <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    onClick={() => setColor(defaultSettings.shortExitsColor ?? '#ffa500')}
                                    title="Przywróć domyślny kolor"
                                    style={{ padding: "0.25rem 0.5rem" }}
                                >
                                    ↺
                                </Button>
                            </div>
                        </div>

                        <div className="mb-3">
                            <Form.Label>Podgląd</Form.Label>
                            <div
                                style={{
                                    padding: '0.5rem',
                                    backgroundColor: '#1a1a1a',
                                    color: color,
                                    fontFamily: 'monospace',
                                    borderRadius: '0.25rem',
                                    border: '1px solid #333',
                                }}
                            >
                                {preview}
                            </div>
                        </div>

                        <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={handleReset}
                            className="w-100"
                        >
                            Przywróć domyślne ustawienia
                        </Button>
                    </section>
                </div>
            </fieldset>
        </div>
    );
}

export default ShortExitsSettings;
