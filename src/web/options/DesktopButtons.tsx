import { useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import {
    applySettings,
    createDefaultButton,
    createDefaultSettings,
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

const listMacros = ['zList', 'zaList', 'wList', 'przeList', 'idzList'];

/** Mirrors the live button's style type (see @web-ui/buttons/DesktopButtons):
 * `--btn-accent` carries the chosen color as a custom property so a host skin
 * can re-purpose it as an accent instead of a flat fill. */
type CSSVarStyle = React.CSSProperties & { '--btn-accent'?: string };
const desktopMacroFilter = (opt: { value: string }) => opt.value !== 'toggleButtons';

function isListMacro(macroType: string): boolean {
    return listMacros.includes(macroType);
}


function DesktopButtons() {
    const [settings, setSettings] = useState<DesktopButtonsSettings>(createDefaultSettings);
    const [selected, setSelected] = useState<string | null>(null);
    const [pluginMacros, setPluginMacros] = useState<PluginButtonMacro[]>([]);

    useEffect(() => {
        setSettings(loadSettings());
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

    function save() {
        saveSettings(settings);
        applySettings(settings);
        window.dispatchEvent(new Event('close-options'));
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
        <div className="w-100 position-relative">
            <div className="d-flex flex-column flex-sm-row flex-sm-wrap align-items-stretch align-items-sm-center gap-2 mb-3">
                <Button size="sm" variant="primary" onClick={addButton}>
                    + Dodaj przycisk
                </Button>
                <Form.Check
                    id="desktop-buttons-lock"
                    type="checkbox"
                    className="user-select-none ms-sm-auto text-nowrap"
                    label="Zablokuj przyciski"
                    checked={settings.locked}
                    onChange={e => setSettings(prev => ({ ...prev, locked: e.target.checked }))}
                />
            </div>

            {settings.buttons.length === 0 && (
                <p className="text-muted text-center mb-3">
                    Brak przycisków. Kliknij "Dodaj przycisk", aby utworzyć nowy.
                </p>
            )}

            {settings.buttons.length > 0 && (
                <div className="mb-3">
                    <Form.Label>Wybierz przycisk do edycji</Form.Label>
                    <div className="d-flex flex-wrap gap-2">
                        {settings.buttons.map(btn => (
                            <Button
                                key={btn.id}
                                size="sm"
                                variant={selected === btn.id ? 'primary' : 'outline-secondary'}
                                onClick={() => setSelected(btn.id)}
                                style={{
                                    backgroundColor: selected === btn.id ? undefined : btn.color,
                                    color: selected === btn.id ? undefined : btn.fontColor,
                                    borderColor: selected === btn.id ? undefined : btn.color,
                                }}
                            >
                                {btn.label || '(pusty)'}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {selectedBtn && (
                <div className="border rounded p-3 mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="mb-0">Edycja: {selectedBtn.label || selectedBtn.id}</h6>
                        <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => removeButton(selectedBtn.id)}
                        >
                            Usuń
                        </Button>
                    </div>

                    <Form.Group className="mb-2">
                        <Form.Label>Etykieta</Form.Label>
                        <Form.Control
                            size="sm"
                            type="text"
                            value={selectedBtn.label}
                            onChange={e => updateButton(selectedBtn.id, { label: e.target.value })}
                        />
                    </Form.Group>

                    <Form.Group className="mb-2">
                        <Form.Label>Makro</Form.Label>
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
                            <Form.Text className="text-warning">
                                Ta wtyczka nie jest zaladowana. Makro nie bedzie dzialac.
                            </Form.Text>
                        )}
                    </Form.Group>

                    <MacroConfigEditor
                        config={selectedBtn}
                        onChange={updates => updateButton(selectedBtn.id, updates)}
                        pluginMacros={pluginMacros}
                        buttonColor={selectedBtn.color}
                    />

                    {isListMacro(selectedBtn.macroType) && (
                        <>
                            <div className="row g-2 mb-2">
                                <div className="col-6">
                                    <Form.Group>
                                        <Form.Label>Pozycja listy</Form.Label>
                                        <Form.Select
                                            size="sm"
                                            value={selectedBtn.listPosition ?? 'bottom'}
                                            onChange={e => updateButton(selectedBtn.id, { listPosition: e.target.value as ListPosition })}
                                        >
                                            <option value="bottom">Na dole</option>
                                            <option value="top">Na górze</option>
                                            <option value="left">Po lewej</option>
                                            <option value="right">Po prawej</option>
                                        </Form.Select>
                                    </Form.Group>
                                </div>
                                <div className="col-6">
                                    <Form.Group>
                                        <Form.Label>Kierunek rozrostu</Form.Label>
                                        <Form.Select
                                            size="sm"
                                            value={selectedBtn.listGrowDirection ?? 'horizontal'}
                                            onChange={e => updateButton(selectedBtn.id, { listGrowDirection: e.target.value as ListGrowDirection })}
                                        >
                                            <option value="horizontal">Poziomo</option>
                                            <option value="vertical">Pionowo</option>
                                        </Form.Select>
                                    </Form.Group>
                                </div>
                            </div>
                            <Form.Check
                                id={`list-close-only-by-button-${selectedBtn.id}`}
                                type="checkbox"
                                className="mb-2"
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

                    <div className="row g-2 mb-2">
                        <div className="col-6">
                            <Form.Group>
                                <Form.Label>Kolor tla</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="color"
                                        value={selectedBtn.color}
                                        onChange={e => updateButton(selectedBtn.id, { color: e.target.value })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { color: defaultButtonColor })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                        <div className="col-6">
                            <Form.Group>
                                <Form.Label>Kolor czcionki</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="color"
                                        value={selectedBtn.fontColor}
                                        onChange={e => updateButton(selectedBtn.id, { fontColor: e.target.value })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { fontColor: defaultFontColor })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                    </div>

                    <Form.Group className="mb-2">
                        <Form.Label>
                            Przezroczystość tła: {Math.round(selectedBtn.backgroundOpacity * 100)}%
                        </Form.Label>
                        <div className="d-flex gap-2 align-items-center">
                            <Form.Range
                                className="flex-grow-1"
                                min={0}
                                max={100}
                                value={Math.round(selectedBtn.backgroundOpacity * 100)}
                                onChange={e => updateButton(selectedBtn.id, {
                                    backgroundOpacity: Number(e.target.value) / 100
                                })}
                            />
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => updateButton(selectedBtn.id, { backgroundOpacity: defaultBackgroundOpacity })}
                            >
                                ↺
                            </Button>
                        </div>
                    </Form.Group>

                    <div className="row g-2 mb-2">
                        <div className="col-4">
                            <Form.Group>
                                <Form.Label>Szerokość</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="number"
                                        min={20}
                                        max={300}
                                        defaultValue={selectedBtn.width}
                                        key={`width-${selectedBtn.id}`}
                                        onChange={e => {
                                            const v = Number(e.target.value);
                                            if (e.target.value !== '' && !isNaN(v) && v > 0) {
                                                updateButton(selectedBtn.id, { width: v });
                                            }
                                        }}
                                        onBlur={e => updateButton(selectedBtn.id, {
                                            width: Math.max(20, Math.min(300, Number(e.target.value) || defaultWidth))
                                        })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { width: defaultWidth })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                        <div className="col-4">
                            <Form.Group>
                                <Form.Label>Wysokość</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="number"
                                        min={20}
                                        max={200}
                                        defaultValue={selectedBtn.height}
                                        key={`height-${selectedBtn.id}`}
                                        onChange={e => {
                                            const v = Number(e.target.value);
                                            if (e.target.value !== '' && !isNaN(v) && v > 0) {
                                                updateButton(selectedBtn.id, { height: v });
                                            }
                                        }}
                                        onBlur={e => updateButton(selectedBtn.id, {
                                            height: Math.max(20, Math.min(200, Number(e.target.value) || defaultHeight))
                                        })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { height: defaultHeight })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                        <div className="col-4">
                            <Form.Group>
                                <Form.Label>Czcionka</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="number"
                                        min={6}
                                        max={100}
                                        defaultValue={selectedBtn.fontSize}
                                        key={`fontSize-${selectedBtn.id}`}
                                        onChange={e => {
                                            const v = Number(e.target.value);
                                            if (e.target.value !== '' && !isNaN(v) && v > 0) {
                                                updateButton(selectedBtn.id, { fontSize: v });
                                            }
                                        }}
                                        onBlur={e => updateButton(selectedBtn.id, {
                                            fontSize: Math.max(6, Math.min(100, Number(e.target.value) || defaultFontSize))
                                        })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { fontSize: defaultFontSize })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                    </div>

                    <div className="row g-2 mb-2">
                        <div className="col-6">
                            <Form.Group>
                                <Form.Label>Pozycja X</Form.Label>
                                <Form.Control
                                    size="sm"
                                    type="number"
                                    min={0}
                                    defaultValue={Math.round(selectedBtn.x)}
                                    key={`x-${selectedBtn.id}`}
                                    onChange={e => {
                                        const v = Number(e.target.value);
                                        if (e.target.value !== '' && !isNaN(v) && v >= 0) {
                                            updateButton(selectedBtn.id, { x: v });
                                        }
                                    }}
                                    onBlur={e => updateButton(selectedBtn.id, {
                                        x: Math.max(0, Number(e.target.value) || 0)
                                    })}
                                />
                            </Form.Group>
                        </div>
                        <div className="col-6">
                            <Form.Group>
                                <Form.Label>Pozycja Y</Form.Label>
                                <Form.Control
                                    size="sm"
                                    type="number"
                                    min={0}
                                    defaultValue={Math.round(selectedBtn.y)}
                                    key={`y-${selectedBtn.id}`}
                                    onChange={e => {
                                        const v = Number(e.target.value);
                                        if (e.target.value !== '' && !isNaN(v) && v >= 0) {
                                            updateButton(selectedBtn.id, { y: v });
                                        }
                                    }}
                                    onBlur={e => updateButton(selectedBtn.id, {
                                        y: Math.max(0, Number(e.target.value) || 0)
                                    })}
                                />
                            </Form.Group>
                        </div>
                    </div>

                    <div className="mt-3 pt-3 border-top">
                        <Form.Label className="mb-2">Podgląd</Form.Label>
                        <div className="d-flex justify-content-center">
                            {renderPreview(selectedBtn)}
                        </div>
                    </div>
                </div>
            )}

            <div className="d-flex justify-content-end">
                <Button id="desktop-buttons-save" onClick={save}>Zapisz</Button>
            </div>
        </div>
    );
}

export default DesktopButtons;
