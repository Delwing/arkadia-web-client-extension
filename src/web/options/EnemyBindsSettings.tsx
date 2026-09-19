import { useEffect, useState } from "react";
import { CheckboxField, SelectField, SettingsCard } from "@web/settings/controls.tsx";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings, Settings } from "./defaultSettings";

function EnemyBindsSettings({ registerSave }: { registerSave: (cb: (sharedSettings: Settings) => void) => void }) {
    const [keepUnchanged, setKeepUnchanged] = useState(false);
    const [showMode, setShowMode] = useState<'always' | 'whenBound' | 'never'>('always');
    const [enabledSlots, setEnabledSlots] = useState<[boolean, boolean, boolean]>([true, true, true]);

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
        <SettingsCard title="Bindy wrogów (F1-F3)">
            <CheckboxField
                id="enemyBindsKeepUnchanged"
                label="Zachowaj bindy bez zmian (raz przypisane, nie zmieniają się)"
                checked={keepUnchanged}
                onChange={setKeepUnchanged}
            />
            <SelectField
                id="enemyBindsShowMode"
                label="Wyświetlanie bindów"
                value={showMode}
                onChange={(v) => setShowMode(v as 'always' | 'whenBound' | 'never')}
            >
                <option value="always">Zawsze (przy każdej zmianie)</option>
                <option value="whenBound">Przy pierwszym przypisaniu</option>
                <option value="never">Nigdy</option>
            </SelectField>
            <div className="settings-field">
                <span className="settings-field__label">Włączone sloty</span>
                {(['F1', 'F2', 'F3'] as const).map((key, index) => (
                    <CheckboxField
                        key={key}
                        id={`enemyBindSlot${index}`}
                        label={`${key} - Slot ${index + 1}`}
                        checked={enabledSlots[index]}
                        onChange={(checked) => {
                            const newSlots: [boolean, boolean, boolean] = [...enabledSlots] as [boolean, boolean, boolean];
                            newSlots[index] = checked;
                            setEnabledSlots(newSlots);
                        }}
                    />
                ))}
            </div>
        </SettingsCard>
    );
}

export default EnemyBindsSettings;
