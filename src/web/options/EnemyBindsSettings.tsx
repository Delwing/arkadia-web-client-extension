import { useEffect, useState } from "react";
import { Check, Field, Input, Select } from "@web-ui/primitives/index.ts";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings, Settings } from "./defaultSettings";

function EnemyBindsSettings({ registerSave }: { registerSave: (cb: (sharedSettings: Settings) => void) => void }) {
    const [keepUnchanged, setKeepUnchanged] = useState(false);
    const [showMode, setShowMode] = useState<'always' | 'whenBound' | 'never'>('always');
    const [enabledSlots, setEnabledSlots] = useState<[boolean, boolean, boolean]>([true, true, true]);
    const [attackCommand, setAttackCommand] = useState('');
    const [blockCommand, setBlockCommand] = useState('');

    useEffect(() => {
        const load = () => {
            const settings = characterStorage.get("settings");
            if (settings) {
                setKeepUnchanged((settings as any).enemyBindsKeepUnchanged ?? defaultSettings.enemyBindsKeepUnchanged);
                setShowMode((settings as any).enemyBindsShowMode ?? defaultSettings.enemyBindsShowMode);
                setEnabledSlots((settings as any).enemyBindsEnabledSlots ?? defaultSettings.enemyBindsEnabledSlots);
                setAttackCommand((settings as any).enemyBindsAttackCommand ?? defaultSettings.enemyBindsAttackCommand);
                setBlockCommand((settings as any).enemyBindsBlockCommand ?? defaultSettings.enemyBindsBlockCommand);
            } else {
                setKeepUnchanged(defaultSettings.enemyBindsKeepUnchanged);
                setShowMode(defaultSettings.enemyBindsShowMode);
                setEnabledSlots(defaultSettings.enemyBindsEnabledSlots);
                setAttackCommand(defaultSettings.enemyBindsAttackCommand);
                setBlockCommand(defaultSettings.enemyBindsBlockCommand);
            }
        };

        load();

        const unsub = characterStorage.onChange('settings', (newValue) => {
            const s = (newValue as any) || {};
            setKeepUnchanged(s.enemyBindsKeepUnchanged ?? defaultSettings.enemyBindsKeepUnchanged);
            setShowMode(s.enemyBindsShowMode ?? defaultSettings.enemyBindsShowMode);
            setEnabledSlots(s.enemyBindsEnabledSlots ?? defaultSettings.enemyBindsEnabledSlots);
            setAttackCommand(s.enemyBindsAttackCommand ?? defaultSettings.enemyBindsAttackCommand);
            setBlockCommand(s.enemyBindsBlockCommand ?? defaultSettings.enemyBindsBlockCommand);
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
            sharedSettings.enemyBindsAttackCommand = attackCommand.trim();
            sharedSettings.enemyBindsBlockCommand = blockCommand.trim();
        });
    }, [registerSave, keepUnchanged, showMode, enabledSlots, attackCommand, blockCommand]);

    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Bindy wrogów (F1-F3)</h5>
            <div className="character-settings-stack">
                <Check
                    id="enemyBindsKeepUnchanged"
                    label="Zachowaj bindy bez zmian (raz przypisane, nie zmieniają się)"
                    checked={keepUnchanged}
                    onChange={(e) => setKeepUnchanged(e.target.checked)}
                />
                <Field label="Wyświetlanie bindów" htmlFor="enemyBindsShowMode">
                    <Select
                        id="enemyBindsShowMode"
                        className="settings-narrow"
                        value={showMode}
                        onChange={(e) => setShowMode(e.target.value as 'always' | 'whenBound' | 'never')}
                    >
                        <option value="always">Zawsze (przy każdej zmianie)</option>
                        <option value="whenBound">Przy pierwszym przypisaniu</option>
                        <option value="never">Nigdy</option>
                    </Select>
                </Field>
                <Field
                    label="Komenda bindu ataku (F1-F3)"
                    htmlFor="enemyBindsAttackCommand"
                    hint="Pusto = zwykły atak klienta. Wpisz własną komendę, a {obj_id} zastąpi numer wroga z GMCP, np. zabij ob_{obj_id} albo wesprzyj ob_{obj_id}."
                >
                    <Input
                        id="enemyBindsAttackCommand"
                        mono
                        value={attackCommand}
                        placeholder="np. zabij ob_{obj_id}"
                        onChange={(e) => setAttackCommand(e.target.value)}
                    />
                </Field>
                <Field
                    label="Komenda bindu blokowania (CTRL+F1-F3)"
                    htmlFor="enemyBindsBlockCommand"
                    hint="Pusto = zablokuj ob_{obj_id}."
                >
                    <Input
                        id="enemyBindsBlockCommand"
                        mono
                        value={blockCommand}
                        placeholder="np. zablokuj ob_{obj_id}"
                        onChange={(e) => setBlockCommand(e.target.value)}
                    />
                </Field>
                <Field label="Włączone sloty">
                    <div className="settings-checks">
                        {(['F1', 'F2', 'F3'] as const).map((key, index) => (
                            <Check
                                key={key}
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
                </Field>
            </div>
        </section>
    );
}

export default EnemyBindsSettings;
