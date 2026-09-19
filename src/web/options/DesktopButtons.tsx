import { useEffect, useState } from "react";
import { Button, Input } from "@design";
import {
    CheckboxField,
    ColorField,
    NumberField,
    SelectField,
    SettingsHint,
} from "@web/settings/controls.tsx";
import {
    applySettings,
    createDefaultButton,
    defaultBackgroundOpacity,
    defaultButtonColor,
    defaultFontColor,
    defaultFontSize,
    defaultHeight,
    defaultWidth,
    DesktopButtonsSettings,
    hexToRgba,
    loadSettings,
    saveSettings,
} from "../desktopButtonSettings";
import type { DesktopButtonSetting, ListPosition, ListGrowDirection } from "../buttonSettings";
import {
    getRegisteredButtonMacros,
    isButtonMacroAvailable,
    getMacroStates,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";
import eventBus from "@modules/core/eventBus";
import MacroSelect from "./MacroSelect";
import MacroConfigEditor from "./MacroConfigEditor";
import HoldConfig from "./HoldConfig";
import { SettingsValue } from "@web/settings/SettingsValue.tsx";

const listMacros = ['zList', 'zaList', 'wList', 'przeList', 'idzList'];

/** Mirrors the live button's style type (see @web-ui/buttons/DesktopButtons):
 * `--btn-accent` carries the chosen color as a custom property so a host skin
 * can re-purpose it as an accent instead of a flat fill. */
type CSSVarStyle = React.CSSProperties & { '--btn-accent'?: string };
const desktopMacroFilter = (opt: { value: string }) => opt.value !== 'toggleButtons';

function isListMacro(macroType: string): boolean {
    return listMacros.includes(macroType);
}


/**
 * The "Przyciski" settings page. Edits stay local until the settings dialog's
 * Save runs the callback given to `registerSave`; the dialog remounts the
 * editor on open, which is how unsaved edits are dropped.
 */
function DesktopButtons({ registerSave }: { registerSave: (save: () => void) => void }) {
    const [stored] = useState(() => JSON.stringify(loadSettings()));
    const [settings, setSettings] = useState<DesktopButtonsSettings>(() => JSON.parse(stored));
    const [selected, setSelected] = useState<string | null>(null);
    const [pluginMacros, setPluginMacros] = useState<PluginButtonMacro[]>([]);

    useEffect(() => {
        registerSave(() => {
            // Untouched: leave storage (and the live buttons) alone.
            if (JSON.stringify(settings) === stored) return;
            saveSettings(settings);
            applySettings(settings);
        });
    }, [registerSave, settings, stored]);

    useEffect(() => {
        setPluginMacros(getRegisteredButtonMacros());

        const handleMacrosChanged = () => {
            setPluginMacros(getRegisteredButtonMacros());
        };
        eventBus.on('pluginButtonMacrosChanged', handleMacrosChanged);
        return () => {
            eventBus.off('pluginButtonMacrosChanged', handleMacrosChanged);
        };
    }, []);

    function nextId(): string {
        let max = 0;
        for (const btn of settings.buttons) {
            const match = /^desktop-btn-(\d+)$/.exec(btn.id);
            if (match) {
                max = Math.max(max, parseInt(match[1], 10));
            }
        }
        return `desktop-btn-${max + 1}`;
    }

    function addButton() {
        const id = nextId();
        const centerX = Math.round(window.innerWidth / 2 - defaultWidth / 2);
        const centerY = Math.round(window.innerHeight / 2 - defaultHeight / 2);
        const newBtn = createDefaultButton(id, centerX, centerY);
        setSettings(prev => ({
            ...prev,
            buttons: [...prev.buttons, newBtn],
        }));
        setSelected(id);
    }

    function removeButton(id: string) {
        setSettings(prev => ({
            ...prev,
            buttons: prev.buttons.filter(b => b.id !== id),
        }));
        if (selected === id) {
            setSelected(null);
        }
    }

    function updateButton(id: string, updates: Partial<DesktopButtonSetting>) {
        setSettings(prev => ({
            ...prev,
            buttons: prev.buttons.map(b => b.id === id ? { ...b, ...updates } : b),
        }));
    }

    const selectedBtn = settings.buttons.find(b => b.id === selected) || null;

    /* The preview renders the real `.desktop-button` / `.desktop-button-list-item`
     * classes rather than re-stating their look inline, so whichever host UI has
     * this editor open skins the preview exactly like the button it will produce.
     * That matters most in forge-ui, which re-skins those classes wholesale
     * (forge-ui/buttons-theme.css) — with the look inlined here, "Podglad" showed
     * a stock flat-blue button no matter what the real one would look like. Only
     * the per-button values (size, color, font) stay inline, matching what
     * DesktopButtons.tsx sets on the live button; `--btn-accent` rides along for
     * the same reason it does there. `position: static` undoes the live button's
     * `position: fixed` so the preview sits in the form's flow. */
    function getButtonStyle(btn: DesktopButtonSetting): CSSVarStyle {
        return {
            position: 'static',
            width: `${btn.width}px`,
            height: `${btn.height}px`,
            backgroundColor: hexToRgba(btn.color, btn.backgroundOpacity),
            color: btn.fontColor,
            fontSize: `${btn.fontSize}px`,
            '--btn-accent': btn.color,
            cursor: 'default',
            flexShrink: 0,
        };
    }

    function getListItemStyle(btn: DesktopButtonSetting): CSSVarStyle {
        return {
            boxSizing: 'border-box',
            width: `${btn.width}px`,
            height: `${btn.height}px`,
            backgroundColor: hexToRgba(btn.color, btn.backgroundOpacity),
            color: btn.fontColor,
            fontSize: `${btn.fontSize}px`,
            '--btn-accent': btn.color,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            cursor: 'default',
            flexShrink: 0,
        };
    }

    function renderPreview(btn: DesktopButtonSetting) {
        // For stateful plugin macros, show all states
        const states = btn.macroType.startsWith('plugin:') ? getMacroStates(btn.macroType) : null;
        if (states && states.length > 0) {
            const config = btn.pluginConfig || {};
            const stateLabels = (config.stateLabels || {}) as Record<string, string>;
            const stateColors = (config.stateColors || {}) as Record<string, string>;
            return (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {states.map(state => {
                        const label = stateLabels[state.id] || state.label;
                        const color = stateColors[state.id] || state.color || btn.color;
                        const displayLabel = btn.label ? `${btn.label} ${label}` : label;
                        return (
                            <button
                                key={state.id}
                                type="button"
                                className="desktop-button"
                                style={{
                                    ...getButtonStyle(btn),
                                    backgroundColor: hexToRgba(color, btn.backgroundOpacity),
                                    '--btn-accent': color,
                                } as CSSVarStyle}
                            >
                                {displayLabel}
                            </button>
                        );
                    })}
                </div>
            );
        }

        const buttonEl = (
            <button type="button" className="desktop-button" style={getButtonStyle(btn)}>
                {btn.label || '(pusty)'}
            </button>
        );

        if (!isListMacro(btn.macroType)) {
            return buttonEl;
        }

        const listPosition = btn.listPosition ?? 'bottom';
        const growDirection = btn.listGrowDirection ?? 'horizontal';

        // Determine flex direction for list items based on grow direction setting
        const listFlexDirection: 'row' | 'column' = growDirection === 'horizontal' ? 'row' : 'column';

        const listItems = (
            <div style={{
                display: 'flex',
                flexDirection: listFlexDirection,
                gap: '4px',
            }}>
                <div className="desktop-button-list-item" style={getListItemStyle(btn)}>1</div>
                <div className="desktop-button-list-item" style={getListItemStyle(btn)}>2</div>
            </div>
        );

        // Container direction based on list position
        const isListAboveOrBelow = listPosition === 'top' || listPosition === 'bottom';
        const containerStyle: React.CSSProperties = {
            display: 'flex',
            flexDirection: isListAboveOrBelow ? 'column' : 'row',
            alignItems: 'center',
            gap: '4px',
        };

        if (listPosition === 'top' || listPosition === 'left') {
            return (
                <div style={containerStyle}>
                    {listItems}
                    {buttonEl}
                </div>
            );
        } else {
            return (
                <div style={containerStyle}>
                    {buttonEl}
                    {listItems}
                </div>
            );
        }
    }

    return (
        <>
            <SettingsValue value={settings} />
            <div className="settings-stack" data-settings-ignore>
                <div className="settings-button-row">
                    <Button size="sm" variant="solid" onClick={addButton}>
                        + Dodaj przycisk
                    </Button>
                    <span className="settings-button-row__end">
                        <CheckboxField
                            id="desktop-buttons-lock"
                            label="Zablokuj przyciski"
                            checked={settings.locked}
                            onChange={checked => setSettings(prev => ({ ...prev, locked: checked }))}
                        />
                    </span>
                </div>

                {settings.buttons.length === 0 && (
                    <SettingsHint>Brak przycisków. Kliknij "Dodaj przycisk", aby utworzyć nowy.</SettingsHint>
                )}

                {settings.buttons.length > 0 && (
                    <div className="settings-field">
                        <span className="settings-field__label">Wybierz przycisk do edycji</span>
                        <div className="settings-button-row">
                            {settings.buttons.map(btn => (
                                <Button
                                    key={btn.id}
                                    size="sm"
                                    variant={selected === btn.id ? 'solid' : 'outline'}
                                    onClick={() => setSelected(btn.id)}
                                    // Unselected chips wear the button's own
                                    // colours so the list reads as the buttons
                                    // it stands for; the selected one wears the
                                    // accent instead, to stay legible.
                                    style={selected === btn.id ? undefined : {
                                        backgroundColor: btn.color,
                                        color: btn.fontColor,
                                        borderColor: btn.color,
                                    }}
                                >
                                    {btn.label || '(pusty)'}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {selectedBtn && (
                    <div className="settings-editor-panel">
                        <div className="settings-editor-panel__header">
                            <h6 className="settings-editor-panel__title">Edycja: {selectedBtn.label || selectedBtn.id}</h6>
                            <Button size="sm" variant="danger-soft" onClick={() => removeButton(selectedBtn.id)}>
                                Usuń
                            </Button>
                        </div>

                        <div className="settings-field">
                            <label className="settings-field__label" htmlFor={`desktop-button-label-${selectedBtn.id}`}>Etykieta</label>
                            <Input
                                id={`desktop-button-label-${selectedBtn.id}`}
                                type="text"
                                value={selectedBtn.label}
                                onChange={e => updateButton(selectedBtn.id, { label: e.target.value })}
                            />
                        </div>

                        <div className="settings-field">
                            <span className="settings-field__label">Makro</span>
                            <MacroSelect
                                value={selectedBtn.macroType}
                                onChange={val => {
                                    const updates: Partial<DesktopButtonSetting> = { macroType: val };
                                    if (val !== 'compound') {
                                        updates.steps = undefined;
                                    }
                                    updateButton(selectedBtn.id, updates);
                                }}
                                pluginMacros={pluginMacros}
                                showUnavailableWarning
                                filter={desktopMacroFilter}
                            />
                            {!isButtonMacroAvailable(selectedBtn.macroType) && (
                                <p className="settings-hint settings-hint--warning">
                                    Ta wtyczka nie jest zaladowana. Makro nie bedzie dzialac.
                                </p>
                            )}
                        </div>

                        <MacroConfigEditor
                            config={selectedBtn}
                            onChange={updates => updateButton(selectedBtn.id, updates)}
                            pluginMacros={pluginMacros}
                            buttonColor={selectedBtn.color}
                        />

                        {isListMacro(selectedBtn.macroType) && (
                            <>
                                <div className="settings-grid settings-grid--2">
                                    <SelectField
                                        id={`list-position-${selectedBtn.id}`}
                                        label="Pozycja listy"
                                        value={selectedBtn.listPosition ?? 'bottom'}
                                        onChange={v => updateButton(selectedBtn.id, { listPosition: v as ListPosition })}
                                    >
                                        <option value="bottom">Na dole</option>
                                        <option value="top">Na górze</option>
                                        <option value="left">Po lewej</option>
                                        <option value="right">Po prawej</option>
                                    </SelectField>
                                    <SelectField
                                        id={`list-grow-${selectedBtn.id}`}
                                        label="Kierunek rozrostu"
                                        value={selectedBtn.listGrowDirection ?? 'horizontal'}
                                        onChange={v => updateButton(selectedBtn.id, { listGrowDirection: v as ListGrowDirection })}
                                    >
                                        <option value="horizontal">Poziomo</option>
                                        <option value="vertical">Pionowo</option>
                                    </SelectField>
                                </div>
                                <CheckboxField
                                    id={`list-close-only-by-button-${selectedBtn.id}`}
                                    label="Zamykaj tylko przyciskiem"
                                    checked={selectedBtn.listCloseOnlyByButton ?? false}
                                    onChange={checked => updateButton(selectedBtn.id, { listCloseOnlyByButton: checked })}
                                />
                            </>
                        )}

                        {selectedBtn.macroType !== 'empty' && (
                            <HoldConfig
                                holdEnabled={selectedBtn.holdEnabled || false}
                                hold={selectedBtn.hold}
                                onToggle={enabled => updateButton(selectedBtn.id, { holdEnabled: enabled })}
                                onChangeHold={hold => updateButton(selectedBtn.id, { hold })}
                                pluginMacros={pluginMacros}
                                locked={settings.locked}
                                idSuffix={selectedBtn.id}
                            />
                        )}

                        {/* One per line, not side by side: ColorField is a
                            label-left/control-right row, and two of them in one
                            grid row read as a single run-on line. */}
                        <div className="settings-stack settings-stack--tight">
                            <ColorField
                                id={`desktop-button-color-${selectedBtn.id}`}
                                label="Kolor tla"
                                value={selectedBtn.color}
                                onChange={v => updateButton(selectedBtn.id, { color: v })}
                                onReset={() => updateButton(selectedBtn.id, { color: defaultButtonColor })}
                            />
                            <ColorField
                                id={`desktop-button-font-color-${selectedBtn.id}`}
                                label="Kolor czcionki"
                                value={selectedBtn.fontColor}
                                onChange={v => updateButton(selectedBtn.id, { fontColor: v })}
                                onReset={() => updateButton(selectedBtn.id, { fontColor: defaultFontColor })}
                            />
                        </div>

                        <div className="settings-field">
                            <label className="settings-field__label" htmlFor={`desktop-button-opacity-${selectedBtn.id}`}>
                                Przezroczystość tła: <span className="settings-field__value">{Math.round(selectedBtn.backgroundOpacity * 100)}</span>%
                            </label>
                            <div className="settings-row__controls">
                                <input
                                    id={`desktop-button-opacity-${selectedBtn.id}`}
                                    type="range"
                                    className="settings-range"
                                    min={0}
                                    max={100}
                                    value={Math.round(selectedBtn.backgroundOpacity * 100)}
                                    onChange={e => updateButton(selectedBtn.id, {
                                        backgroundOpacity: Number(e.target.value) / 100,
                                    })}
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    title="Przywróć domyślną przezroczystość"
                                    onClick={() => updateButton(selectedBtn.id, { backgroundOpacity: defaultBackgroundOpacity })}
                                >
                                    {'↺'}
                                </Button>
                            </div>
                        </div>

                        <div className="settings-grid settings-grid--3">
                            <SizeField
                                id={`desktop-button-width-${selectedBtn.id}`}
                                label="Szerokość"
                                value={selectedBtn.width}
                                min={20}
                                max={300}
                                fallback={defaultWidth}
                                onCommit={width => updateButton(selectedBtn.id, { width })}
                            />
                            <SizeField
                                id={`desktop-button-height-${selectedBtn.id}`}
                                label="Wysokość"
                                value={selectedBtn.height}
                                min={20}
                                max={200}
                                fallback={defaultHeight}
                                onCommit={height => updateButton(selectedBtn.id, { height })}
                            />
                            <SizeField
                                id={`desktop-button-font-size-${selectedBtn.id}`}
                                label="Czcionka"
                                value={selectedBtn.fontSize}
                                min={6}
                                max={100}
                                fallback={defaultFontSize}
                                onCommit={fontSize => updateButton(selectedBtn.id, { fontSize })}
                            />
                        </div>

                        <div className="settings-grid settings-grid--2">
                            <NumberField
                                id={`desktop-button-x-${selectedBtn.id}`}
                                label="Pozycja X"
                                value={Math.round(selectedBtn.x)}
                                min={0}
                                onChange={n => updateButton(selectedBtn.id, { x: Math.max(0, n) })}
                            />
                            <NumberField
                                id={`desktop-button-y-${selectedBtn.id}`}
                                label="Pozycja Y"
                                value={Math.round(selectedBtn.y)}
                                min={0}
                                onChange={n => updateButton(selectedBtn.id, { y: Math.max(0, n) })}
                            />
                        </div>

                        <div className="settings-subsection">
                            <span className="settings-field__label">Podgląd</span>
                            <div className="settings-preview-stage">
                                {renderPreview(selectedBtn)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

/**
 * A size in pixels, clamped only once the field is left. Clamping on every
 * keystroke makes "30" unreachable from "300" -- the 3 clamps to the minimum
 * before the rest is typed -- which is why the Bootstrap original committed
 * loose values on change and the clamped one on blur. Same contract here.
 */
function SizeField({ id, label, value, min, max, fallback, onCommit }: {
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    fallback: number;
    onCommit: (value: number) => void;
}) {
    const [text, setText] = useState(String(value));
    useEffect(() => { setText(String(value)); }, [value]);
    return (
        <div className="settings-field">
            <label className="settings-field__label" htmlFor={id}>{label}</label>
            <div className="settings-row__controls">
                <Input
                    id={id}
                    type="number"
                    min={min}
                    max={max}
                    value={text}
                    onChange={e => {
                        setText(e.target.value);
                        const v = Number(e.target.value);
                        if (e.target.value !== '' && !isNaN(v) && v > 0) onCommit(v);
                    }}
                    onBlur={e => onCommit(Math.max(min, Math.min(max, Number(e.target.value) || fallback)))}
                />
                <Button size="sm" variant="outline" title="Przywróć domyślną wartość" onClick={() => onCommit(fallback)}>
                    {'↺'}
                </Button>
            </div>
        </div>
    );
}

export default DesktopButtons;
