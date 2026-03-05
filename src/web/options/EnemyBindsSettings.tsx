import { useEffect, useState } from "react";
import { Form } from "react-bootstrap";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings, Settings } from "./defaultSettings";

function EnemyBindsSettings({ registerSave }: { registerSave: (cb: (sharedSettings: Settings) => void) => void }) {
    const [keepUnchanged, setKeepUnchanged] = useState(false);
    const [showMode, setShowMode] = useState<'always' | 'whenBound' | 'never'>('always');
    const [enabledSlots, setEnabledSlots] = useState<[boolean, boolean, boolean]>([true, true, true]);
    const [locked, setLocked] = useState(!characterStorage.getCharacter());

    useEffect(() => {
        const update = () => setLocked(!characterStorage.getCharacter());
        return characterStorage.onCharacterChange(update);
    }, []);

    useEffect(() => {
        const load = () => {
            const settings = characterStorage.get("settings");
            if (settings) {
                setKeepUnchanged((settings as any).enemyBindsKeepUnchanged ?? defaultSettings.enemyBindsKeepUnchanged);
                setShowMode((settings as any).enemyBindsShowMode ?? defaultSettings.enemyBindsShowMode);
                setEnabledSlots((settings as any).enemyBindsEnabledSlots ?? defaultSettings.enemyBindsEnabledSlots);
            } else {
                setKeepUnchanged(defaultSettings.enemyBindsKeepUnchanged);
                setShowMode(defaultSettings.enemyBindsShowMode);
                setEnabledSlots(defaultSettings.enemyBindsEnabledSlots);
            }
        };

        load();

        const unsub = characterStorage.onChange('settings', (newValue) => {
            const s = (newValue as any) || {};
            setKeepUnchanged(s.enemyBindsKeepUnchanged ?? defaultSettings.enemyBindsKeepUnchanged);
            setShowMode(s.enemyBindsShowMode ?? defaultSettings.enemyBindsShowMode);
            setEnabledSlots(s.enemyBindsEnabledSlots ?? defaultSettings.enemyBindsEnabledSlots);
        });
        return () => {
            unsub();
        };
    }, []);

    useEffect(() => {
        registerSave((sharedSettings: Settings) => {
            // Update the shared settings object with our values
            sharedSettings.enemyBindsKeepUnchanged = keepUnchanged;
            sharedSettings.enemyBindsShowMode = showMode;
            sharedSettings.enemyBindsEnabledSlots = enabledSlots;
        });
    }, [registerSave, keepUnchanged, showMode, enabledSlots]);

    return (
        <div className="p-2 h-100">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="character-settings-layout">
                    <section className="character-settings-section">
                        <h5 className="character-settings-section-title">Bindy wrogów (F1-F3)</h5>
                        <div className="d-flex flex-column gap-3">
                            <Form.Check
                                type="checkbox"
                                id="enemyBindsKeepUnchanged"
                                label="Zachowaj bindy bez zmian (raz przypisane, nie zmieniają się)"
                                checked={keepUnchanged}
                                onChange={(e) => setKeepUnchanged(e.target.checked)}
                            />

                            <Form.Group>
                                <Form.Label>Wyświetlanie bindów</Form.Label>
                                <Form.Select
                                    value={showMode}
                                    onChange={(e) => setShowMode(e.target.value as 'always' | 'whenBound' | 'never')}
                                >
                                    <option value="always">Zawsze (przy każdej zmianie)</option>
                                    <option value="whenBound">Przy pierwszym przypisaniu</option>
                                    <option value="never">Nigdy</option>
                                </Form.Select>
                            </Form.Group>

                            <Form.Group>
                                <Form.Label>Włączone sloty</Form.Label>
                                <div className="d-flex flex-column gap-2">
                                    {(['F1', 'F2', 'F3'] as const).map((key, index) => (
                                        <Form.Check
                                            key={key}
                                            type="checkbox"
                                            id={`enemyBindSlot${index}`}
                                            label={`${key} - Slot ${index + 1}`}
                                            checked={enabledSlots[index]}
                                            onChange={(e) => {
                                                const newSlots: [boolean, boolean, boolean] = [...enabledSlots] as [boolean, boolean, boolean];
                                                newSlots[index] = e.target.checked;
                                                setEnabledSlots(newSlots);
                                            }}
                                        />
                                    ))}
                                </div>
                            </Form.Group>
                        </div>
                    </section>
                </div>
            </fieldset>
        </div>
    );
}

export default EnemyBindsSettings;
