import { useEffect, useState } from "react";
import { Button, Check, DeleteButton, Field, Input, Select } from "@web-ui/primitives/index.ts";
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
    // Bumped by a ↺ so the uncontrolled number fields pick up the reset value.
    const [resetTick, setResetTick] = useState(0);

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

    /** Number input that commits valid values as you type and clamps on blur. */
    function numberField(
        label: string,
        key: 'width' | 'height' | 'fontSize' | 'x' | 'y',
        min: number,
        max: number | undefined,
        fallback: number,
        onReset?: () => void,
    ) {
        const btn = selectedBtn!;
        const value = key === 'x' || key === 'y' ? Math.round(btn[key]) : btn[key];
        const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n));
        return (
            <Field label={label}>
                <div className="popup-inline">
                    <Input
                        type="number"
                        className="settings-num"
                        min={min}
                        max={max}
                        defaultValue={value}
                        key={`${key}-${btn.id}-${resetTick}`}
                        onChange={e => {
                            const v = Number(e.target.value);
                            if (e.target.value !== '' && !isNaN(v) && v >= Math.min(min, 1)) {
                                updateButton(btn.id, { [key]: v });
                            }
                        }}
                        onBlur={e => updateButton(btn.id, { [key]: clamp(Number(e.target.value) || fallback) })}
                    />
                    {onReset && (
                        <Button size="sm" variant="ghost" title="Przywróć domyślne" onClick={() => { onReset(); setResetTick(t => t + 1); }}>↺</Button>
                    )}
                </div>
            </Field>
        );
    }

    function colorField(label: string, key: 'color' | 'fontColor', fallback: string) {
        const btn = selectedBtn!;
        return (
            <Field label={label}>
                <div className="popup-inline">
                    <input
                        type="color"
                        className="popup-color"
                        value={btn[key]}
                        onChange={e => updateButton(btn.id, { [key]: e.target.value })}
                    />
                    <Button size="sm" variant="ghost" title="Przywróć domyślny kolor" onClick={() => updateButton(btn.id, { [key]: fallback })}>↺</Button>
                </div>
            </Field>
        );
    }

    return (
        <>
            <SettingsValue value={settings} />
            <div className="ui-settings-stack" data-settings-ignore>
                <div className="popup-inline settings-wrap desktop-buttons-toolbar">
                    <Button size="sm" variant="solid" onClick={addButton}>
                        + Dodaj przycisk
                    </Button>
                    <Check
                        id="desktop-buttons-lock"
                        label="Zablokuj przyciski"
                        checked={settings.locked}
                        onChange={e => setSettings(prev => ({ ...prev, locked: e.target.checked }))}
                    />
                </div>

                {settings.buttons.length === 0 && (
                    <p className="popup-field__hint">
                        Brak przycisków. Kliknij "Dodaj przycisk", aby utworzyć nowy.
                    </p>
                )}

                {settings.buttons.length > 0 && (
                    <Field label="Wybierz przycisk do edycji">
                        <div className="desktop-buttons-picker">
                            {settings.buttons.map(btn => (
                                <button
                                    key={btn.id}
                                    type="button"
                                    className={`desktop-buttons-picker__item${selected === btn.id ? ' is-active' : ''}`}
                                    onClick={() => setSelected(btn.id)}
                                    style={{ backgroundColor: btn.color, color: btn.fontColor }}
                                >
                                    {btn.label || '(pusty)'}
                                </button>
                            ))}
                        </div>
                    </Field>
                )}

                {selectedBtn && (
                    <div className="desktop-button-editor">
                        <div className="desktop-button-editor__header">
                            <span className="desktop-button-editor__title">Edycja: {selectedBtn.label || selectedBtn.id}</span>
                            <DeleteButton title="Usuń przycisk" onClick={() => removeButton(selectedBtn.id)} />
                        </div>

                        <div className="desktop-button-editor__body">
                            <div className="desktop-button-editor__form">
                                <Field label="Etykieta">
                                    <Input
                                        value={selectedBtn.label}
                                        onChange={e => updateButton(selectedBtn.id, { label: e.target.value })}
                                    />
                                </Field>

                                <Field
                                    label="Makro"
                                    error={isButtonMacroAvailable(selectedBtn.macroType) ? undefined : "Ta wtyczka nie jest zaladowana. Makro nie bedzie dzialac."}
                                >
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
                                </Field>

                                <MacroConfigEditor
                                    config={selectedBtn}
                                    onChange={updates => updateButton(selectedBtn.id, updates)}
                                    pluginMacros={pluginMacros}
                                    buttonColor={selectedBtn.color}
                                />

                                {isListMacro(selectedBtn.macroType) && (
                                    <>
                                        <div className="settings-fields-row">
                                            <Field label="Pozycja listy">
                                                <Select
                                                    value={selectedBtn.listPosition ?? 'bottom'}
                                                    onChange={e => updateButton(selectedBtn.id, { listPosition: e.target.value as ListPosition })}
                                                >
                                                    <option value="bottom">Na dole</option>
                                                    <option value="top">Na górze</option>
                                                    <option value="left">Po lewej</option>
                                                    <option value="right">Po prawej</option>
                                                </Select>
                                            </Field>
                                            <Field label="Kierunek rozrostu">
                                                <Select
                                                    value={selectedBtn.listGrowDirection ?? 'horizontal'}
                                                    onChange={e => updateButton(selectedBtn.id, { listGrowDirection: e.target.value as ListGrowDirection })}
                                                >
                                                    <option value="horizontal">Poziomo</option>
                                                    <option value="vertical">Pionowo</option>
                                                </Select>
                                            </Field>
                                        </div>
                                        <Check
                                            id={`list-close-only-by-button-${selectedBtn.id}`}
                                            label="Zamykaj tylko przyciskiem"
                                            checked={selectedBtn.listCloseOnlyByButton ?? false}
                                            onChange={e => updateButton(selectedBtn.id, { listCloseOnlyByButton: e.target.checked })}
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

                                <div className="settings-subsection ui-settings-stack">
                                    <div className="settings-fields-row">
                                        {colorField("Kolor tla", "color", defaultButtonColor)}
                                        {colorField("Kolor czcionki", "fontColor", defaultFontColor)}
                                    </div>
                                    <Field label={`Przezroczystość tła: ${Math.round(selectedBtn.backgroundOpacity * 100)}%`}>
                                        <div className="popup-inline">
                                            <input
                                                type="range"
                                                className="popup-range"
                                                min={0}
                                                max={100}
                                                value={Math.round(selectedBtn.backgroundOpacity * 100)}
                                                onChange={e => updateButton(selectedBtn.id, {
                                                    backgroundOpacity: Number(e.target.value) / 100
                                                })}
                                            />
                                            <Button size="sm" variant="ghost" title="Przywróć domyślne" onClick={() => updateButton(selectedBtn.id, { backgroundOpacity: defaultBackgroundOpacity })}>↺</Button>
                                        </div>
                                    </Field>
                                    <div className="settings-fields-row">
                                        {numberField("Szerokość", "width", 20, 300, defaultWidth, () => updateButton(selectedBtn.id, { width: defaultWidth }))}
                                        {numberField("Wysokość", "height", 20, 200, defaultHeight, () => updateButton(selectedBtn.id, { height: defaultHeight }))}
                                        {numberField("Czcionka", "fontSize", 6, 100, defaultFontSize, () => updateButton(selectedBtn.id, { fontSize: defaultFontSize }))}
                                    </div>
                                    <div className="settings-fields-row">
                                        {numberField("Pozycja X", "x", 0, undefined, 0)}
                                        {numberField("Pozycja Y", "y", 0, undefined, 0)}
                                    </div>
                                </div>
                            </div>

                            <div className="popup-field desktop-button-editor__preview">
                                <span className="popup-field__label">Podgląd</span>
                                <div className="desktop-button-editor__preview-stage">
                                    {renderPreview(selectedBtn)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

export default DesktopButtons;
