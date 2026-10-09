import { useEffect, useState } from "react";
import { Button, Check, DeleteButton, Input } from "@web-ui/primitives/index.ts";
import { globalStorage } from "@modules/core/storage";
import { loadSettings, saveSettings } from "../mobileButtonSettings";
import {
    JOYSTICK_MACROS,
    JOYSTICK_MAX_SIZE,
    JOYSTICK_MIN_SIZE,
    clampJoystickSize,
    createJoystickId,
    defaultJoystickColor,
    defaultJoystickFontColor,
    parseJoystickSettings,
    type JoystickDirection,
    type JoystickSetting,
    type JoystickSettings,
} from "../joystickSettings";

/** The 3x3 editor grid: compass directions around the tap command. */
const GRID: (JoystickDirection | "center")[] = ["nw", "n", "ne", "w", "center", "e", "sw", "s", "se"];

/** Suggests the built-in actions in every slot. */
const ACTIONS_LIST_ID = "joystick-actions";

function JoystickCard({ item, disabled, onChange, onRemove }: {
    item: JoystickSetting;
    disabled: boolean;
    onChange: (next: JoystickSetting) => void;
    onRemove: () => void;
}) {
    const setCommand = (dir: JoystickDirection, value: string) => {
        const commands = { ...item.commands };
        if (value) commands[dir] = value;
        else delete commands[dir];
        onChange({ ...item, commands });
    };

    return (
        <div className="joystick-editor__card" data-joystick-editor-id={item.id}>
            <div className="joystick-editor__head">
                <Input
                    value={item.label}
                    placeholder="Napis na środku (opcjonalny)"
                    title="Napis na środku"
                    disabled={disabled}
                    onChange={e => onChange({ ...item, label: e.target.value })}
                />
                <DeleteButton disabled={disabled} title="Usuń joystick" onClick={onRemove} />
            </div>
            <div className="joystick-editor__grid">
                {GRID.map(cell => cell === "center" ? (
                    <Input
                        key={cell}
                        mono
                        list={ACTIONS_LIST_ID}
                        className="joystick-editor__center"
                        value={item.center}
                        placeholder="dotknięcie"
                        title="Komenda po dotknięciu bez przesunięcia"
                        disabled={disabled}
                        onChange={e => onChange({ ...item, center: e.target.value })}
                    />
                ) : (
                    <Input
                        key={cell}
                        mono
                        list={ACTIONS_LIST_ID}
                        value={item.commands[cell] ?? ""}
                        placeholder={cell}
                        title={`Komenda po przesunięciu: ${cell}`}
                        disabled={disabled}
                        onChange={e => setCommand(cell, e.target.value)}
                    />
                ))}
            </div>
            <div className="joystick-editor__look">
                <label className="joystick-editor__size">
                    <span className="popup-field__label">Rozmiar</span>
                    <input
                        type="range"
                        min={JOYSTICK_MIN_SIZE}
                        max={JOYSTICK_MAX_SIZE}
                        step={2}
                        value={item.size}
                        disabled={disabled}
                        onChange={e => onChange({ ...item, size: clampJoystickSize(e.target.value) })}
                    />
                    <span className="joystick-editor__size-value">{item.size}px</span>
                </label>
                <label className="joystick-editor__color">
                    <span className="popup-field__label">Kolor</span>
                    <input type="color" className="popup-color" value={item.color} disabled={disabled}
                        onChange={e => onChange({ ...item, color: e.target.value })} />
                </label>
                <label className="joystick-editor__color">
                    <span className="popup-field__label">Tekst</span>
                    <input type="color" className="popup-color" value={item.fontColor} disabled={disabled}
                        onChange={e => onChange({ ...item, fontColor: e.target.value })} />
                </label>
            </div>
        </div>
    );
}

function normalize(joysticks: JoystickSettings): JoystickSettings {
    // Same trimming and clamping the loader applies, so a save round-trips.
    return parseJoystickSettings(joysticks);
}

/**
 * The "Joysticki" settings page. Edits stay local until the settings dialog's
 * Save runs the callback given to `registerSave`; the dialog remounts the
 * editor on open, which is how unsaved edits are dropped.
 */
function MobileJoysticks({ registerSave }: { registerSave: (save: () => void) => void }) {
    const [stored] = useState(() => JSON.stringify(loadSettings().joysticks));
    const [joysticks, setJoysticks] = useState<JoystickSettings>(() => JSON.parse(stored));
    const enabled = joysticks.enabled;

    useEffect(() => {
        registerSave(() => {
            if (JSON.stringify(joysticks) === stored) return;
            // The rest of this entry belongs to "Przyciski mobilne", saved alongside.
            saveSettings({ ...loadSettings(), joysticks: normalize(joysticks) });
        });
    }, [registerSave, joysticks, stored]);

    const updateItems = (update: (items: JoystickSetting[]) => JoystickSetting[]) =>
        setJoysticks(prev => ({ ...prev, items: update(prev.items) }));

    const addJoystick = () => updateItems(items => [...items, {
        id: createJoystickId(),
        label: "",
        center: "",
        commands: {},
        size: 96,
        color: defaultJoystickColor,
        fontColor: defaultJoystickFontColor,
    }]);

    return (
        <div className="ui-settings-stack">
            <Check
                id="mobile-joysticks-enabled"
                label="Pokaż joysticki"
                checked={enabled}
                onChange={e => setJoysticks(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            <Check
                id="mobile-joysticks-lock"
                label="Zablokuj joysticki"
                checked={joysticks.locked}
                disabled={!enabled}
                onChange={e => setJoysticks(prev => ({ ...prev, locked: e.target.checked }))}
            />
            <p className="popup-field__hint">
                Dotknięcie wysyła komendę ze środka, przesunięcie palcem od środka — komendę z danego kierunku.
                Przytrzymanie pokazuje wszystkie komendy wokół joysticka; przytrzymaj i przeciągnij, aby go przesunąć.
                Zablokowanych joysticków nie da się przesunąć, więc powolne przesunięcie po przytrzymaniu też wysyła komendę. Puste pola kierunków są pomijane.
                Zamiast komendy można wpisać <code>@zerknij</code> albo <code>@wyjscie</code> (pierwsze wyjście specjalne z lokacji); <code>@wyjscie2</code> i <code>@wyjscie3</code> biorą drugie i trzecie.
            </p>
            <datalist id={ACTIONS_LIST_ID}>
                {Object.entries(JOYSTICK_MACROS).map(([value, macro]) => (
                    <option key={value} value={value}>{macro.label}</option>
                ))}
            </datalist>
            <div className="joystick-editor">
                {joysticks.items.length === 0 && (
                    <p className="popup-field__hint">Brak joysticków. Dodaj nowy.</p>
                )}
                {joysticks.items.map(item => (
                    <JoystickCard
                        key={item.id}
                        item={item}
                        disabled={!enabled}
                        onChange={next => updateItems(items => items.map(j => (j.id === item.id ? next : j)))}
                        onRemove={() => updateItems(items => items.filter(j => j.id !== item.id))}
                    />
                ))}
            </div>
            <div className="popup-inline">
                <Button id="mobile-joysticks-add" size="sm" disabled={!enabled} onClick={addJoystick}>
                    Dodaj joystick
                </Button>
                <Button size="sm" variant="ghost" onClick={() => globalStorage.remove("mobileJoystickPositions")}>
                    Resetuj pozycje
                </Button>
            </div>
        </div>
    );
}

export default MobileJoysticks;
