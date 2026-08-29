import {RefObject, useEffect, useRef, useState} from "react";
import {Button, Form} from "react-bootstrap";
import {
    applySettings,
    createDefaultLayout,
    defaultBackground,
    defaultButtonGap,
    defaultButtonSize,
    defaultCols,
    defaultOrder,
    defaultSettings,
    loadSettings,
    rebaseOverrides,
    saveSettings,
    Settings,
} from "../mobileButtonSettings";
import type { MobileButtonSetting } from "../buttonSettings";
import { defaultFontColor } from "../buttonSettings";
import {getTeamState} from "@modules/core/teamStateProvider";
import {
    getRegisteredButtonMacros,
    isButtonMacroAvailable,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";
import eventBus from "@modules/core/eventBus";

import ButtonGrid, {Mode} from "./ButtonGrid";
import MacroSelect from "./MacroSelect";
import MacroConfigEditor from "./MacroConfigEditor";
import HoldConfig from "./HoldConfig";

const emptySetting: MobileButtonSetting = { macroType: 'empty', label: '', color: 'transparent', fontColor: defaultFontColor };

function clampAlpha(value: number) {
    if (Number.isNaN(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

function toHex(value: number) {
    const clamped = Math.min(255, Math.max(0, Math.round(value)));
    return clamped.toString(16).padStart(2, '0');
}

function parseBackgroundColor(value: string) {
    const fallback = { hex: '#87ceeb', alpha: 0.7 };
    if (!value) {
        return fallback;
    }
    const trimmed = value.trim();
    const hexMatch = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(trimmed);
    if (hexMatch) {
        const rgb = hexMatch[1];
        const alphaHex = hexMatch[2];
        const alpha = alphaHex ? parseInt(alphaHex, 16) / 255 : 1;
        return { hex: `#${rgb.toLowerCase()}`, alpha: clampAlpha(alpha) };
    }
    const rgbaMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i.exec(trimmed);
    if (rgbaMatch) {
        const [, r, g, b, a] = rgbaMatch;
        const hex = `#${toHex(parseInt(r, 10))}${toHex(parseInt(g, 10))}${toHex(parseInt(b, 10))}`;
        const alpha = a !== undefined ? clampAlpha(parseFloat(a)) : 1;
        return { hex, alpha };
    }
    return fallback;
}

function rgbaFromHexAlpha(hex: string, alpha: number) {
    const normalized = clampAlpha(alpha);
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    const alphaRounded = Math.round(normalized * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${alphaRounded})`;
}

type SettingsMap = Record<string, MobileButtonSetting>;

const modes: Mode[] = ['solo', 'team', 'leader'];

function getCurrentMode(): Mode {
    const { isInAnyTeam, isLeader } = getTeamState();
    return isLeader ? 'leader' : isInAnyTeam ? 'team' : 'solo';
}

function MobileButtons() {
    const [settings, setSettings] = useState<Settings>({
        solo: { buttons: {}, order: [...defaultOrder], cols: defaultCols, background: defaultBackground },
        team: { buttons: {}, order: [...defaultOrder], cols: defaultCols, background: defaultBackground },
        leader: { buttons: {}, order: [...defaultOrder], cols: defaultCols, background: defaultBackground },
        locked: false,
        radial: { enabled: true, commands: [] },
        buttonSize: defaultButtonSize,
        buttonGap: defaultButtonGap,
    });
    const [syncDirs, setSyncDirs] = useState(true);
    const [active, setActive] = useState<{ set: Mode; id: string } | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
    const [pluginMacros, setPluginMacros] = useState<PluginButtonMacro[]>([]);
    const [view, setView] = useState<Mode>(() => getCurrentMode());
    const [isMobile, setIsMobile] = useState(false);
    const [configOpen, setConfigOpen] = useState(false);
    const soloRef = useRef<HTMLDivElement>(null);
    const teamRef = useRef<HTMLDivElement>(null);
    const leaderRef = useRef<HTMLDivElement>(null);
    const refs: Record<Mode, RefObject<HTMLDivElement>> = {
        solo: soloRef,
        team: teamRef,
        leader: leaderRef,
    };
    const [copyFrom, setCopyFrom] = useState<Mode>('solo');

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

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);
    const notEditable: string[] = [];

    // Every layout-changing update goes through here: when the base (solo) layout
    // changes, team/leader are re-resolved so cells they don't explicitly override
    // pick up the new base instead of freezing the old value into an override.
    function updateSettings(updater: (prev: Settings) => Settings) {
        setSettings(prev => rebaseOverrides(prev, updater(prev)));
    }

    function nextId(ids: string[]) {
        let current = ids.reduce((m, id) => {
            const match = /^button-(\d+)$/.exec(id);
            return match ? Math.max(m, parseInt(match[1], 10)) : m;
        }, 3);
        return () => `button-${++current}`;
    }

    function addRow(pos: 'top' | 'bottom') {
        updateSettings(prev => {
            const set = prev[view];
            const makeId = nextId(set.order);
            const ids = Array.from({ length: set.cols }, () => makeId());
            const buttons: SettingsMap = { ...set.buttons };
            ids.forEach(id => {
                buttons[id] = { ...emptySetting };
            });
            const order = pos === 'top' ? [...ids, ...set.order] : [...set.order, ...ids];
            return { ...prev, [view]: { ...set, buttons, order } };
        });
    }

    function removeRow(pos: 'top' | 'bottom') {
        updateSettings(prev => {
            const set = prev[view];
            const rows = Math.floor(set.order.length / set.cols);
            if (rows <= 1) return prev;
            const start = pos === 'top' ? 0 : set.order.length - set.cols;
            const removed = set.order.slice(start, start + set.cols);
            const order = pos === 'top' ? set.order.slice(set.cols) : set.order.slice(0, start);
            const buttons: SettingsMap = { ...set.buttons };
            removed.forEach(id => { delete buttons[id]; });
            return { ...prev, [view]: { ...set, buttons, order } };
        });
    }

    function addCol(side: 'left' | 'right') {
        updateSettings(prev => {
            const set = prev[view];
            const makeId = nextId(set.order);
            const buttons: SettingsMap = { ...set.buttons };
            const order: string[] = [];
            const rows = Math.floor(set.order.length / set.cols);
            for (let r = 0; r < rows; r++) {
                if (side === 'left') {
                    const id = makeId();
                    order.push(id);
                    buttons[id] = { ...emptySetting };
                }
                const row = set.order.slice(r * set.cols, (r + 1) * set.cols);
                order.push(...row);
                if (side === 'right') {
                    const id = makeId();
                    order.push(id);
                    buttons[id] = { ...emptySetting };
                }
            }
            return { ...prev, [view]: { ...set, buttons, order, cols: set.cols + 1 } };
        });
    }

    function removeCol(side: 'left' | 'right') {
        updateSettings(prev => {
            const set = prev[view];
            if (set.cols <= 1) return prev;
            const rows = Math.floor(set.order.length / set.cols);
            const order: string[] = [];
            const removed: string[] = [];
            for (let r = 0; r < rows; r++) {
                const row = set.order.slice(r * set.cols, (r + 1) * set.cols);
                if (side === 'left') {
                    removed.push(row[0]);
                    order.push(...row.slice(1));
                } else {
                    removed.push(row[row.length - 1]);
                    order.push(...row.slice(0, row.length - 1));
                }
            }
            const buttons: SettingsMap = { ...set.buttons };
            removed.forEach(id => { delete buttons[id]; });
            return { ...prev, [view]: { ...set, buttons, order, cols: set.cols - 1 } };
        });
    }

    function openConfig(setName: Mode, id: string, ev: React.MouseEvent<HTMLButtonElement>) {
        const rect = ev.currentTarget.getBoundingClientRect();
        // Use viewport coordinates for fixed positioning
        setPos({ left: rect.left, top: rect.bottom + 4 });
        setActive({ set: setName, id });
        setConfigOpen(true);
        const cfg = settings[setName].buttons[id] || defaultSettings[id] || emptySetting;
        if (cfg.macroType === 'kierunek') {
            setSyncDirs(true);
        }
        ev.stopPropagation();
    }

    function changeView(v: Mode) {
        setView(v);
        setActive(null);
        setConfigOpen(false);
    }

    function close() {
        if (isMobile) {
            setConfigOpen(false);
            setTimeout(() => setActive(null), 300);
        } else {
            setActive(null);
            setConfigOpen(false);
        }
    }

    function update(setName: Mode, id: string, field: keyof MobileButtonSetting, value: any) {
        updateSettings(prev => ({
            ...prev,
            [setName]: {
                ...prev[setName],
                buttons: {
                    ...prev[setName].buttons,
                    [id]: { ...prev[setName].buttons[id], [field]: value },
                },
            },
        }));
    }

    function updateAllDirections(field: 'color' | 'activeColor' | 'fontColor', value: string) {
        updateSettings(prev => {
            const updateSet = (set: Settings['solo']) => {
                const buttons: SettingsMap = { ...set.buttons };
                set.order.forEach(id => {
                    const cfg = buttons[id] || defaultSettings[id] || emptySetting;
                    if (cfg.macroType === 'kierunek') {
                        buttons[id] = { ...cfg, [field]: value };
                    }
                });
                return { ...set, buttons };
            };
            return {
                ...prev,
                solo: updateSet(prev.solo),
                team: updateSet(prev.team),
                leader: updateSet(prev.leader),
            };
        });
    }

    function resetColor(setName: Mode, id: string) {
        const def = defaultSettings[id]?.color || emptySetting.color;
        if (syncDirs && (settings[setName].buttons[id]?.macroType === 'kierunek' || defaultSettings[id]?.macroType === 'kierunek')) {
            updateAllDirections('color', def);
        } else {
            update(setName, id, 'color', def);
        }
    }

    function resetActiveColor(setName: Mode, id: string) {
        const def = defaultSettings[id]?.activeColor || '#2fa7c5';
        if (syncDirs && (settings[setName].buttons[id]?.macroType === 'kierunek' || defaultSettings[id]?.macroType === 'kierunek')) {
            updateAllDirections('activeColor', def);
        } else {
            update(setName, id, 'activeColor', def);
        }
    }

    function resetFontColor(setName: Mode, id: string) {
        const def = defaultSettings[id]?.fontColor || defaultFontColor;
        if (syncDirs && (settings[setName].buttons[id]?.macroType === 'kierunek' || defaultSettings[id]?.macroType === 'kierunek')) {
            updateAllDirections('fontColor', def);
        } else {
            update(setName, id, 'fontColor', def);
        }
    }

    function makeBlank(setName: Mode, id: string) {
        updateSettings(prev => ({
            ...prev,
            [setName]: {
                ...prev[setName],
                buttons: { ...prev[setName].buttons, [id]: { ...emptySetting } },
            },
        }));
    }

    function restoreDefaults(setName: Mode) {
        updateSettings(prev => ({
            ...prev,
            [setName]: createDefaultLayout(),
        }));
        setActive(null);
    }

    function resetPosition() {
        eventBus.emit('mobileButtonsResetPosition');
    }

    function copyLayout(from: Mode) {
        const to = view;
        if (from === to) return;
        updateSettings(prev => ({ ...prev, [to]: JSON.parse(JSON.stringify(prev[from])) }));
    }

    // Reset all overrides for the current view: makes it inherit from base (solo) entirely.
    function resetOverrides() {
        if (view === 'solo') return;
        setSettings(prev => ({ ...prev, [view]: JSON.parse(JSON.stringify(prev.solo)) }));
        setActive(null);
        setConfigOpen(false);
    }

    function save() {
        saveSettings(settings);
        const { isInAnyTeam, isLeader } = getTeamState();
        applySettings(settings, isInAnyTeam, isLeader);
        window.dispatchEvent(new Event('close-options'));
    }

    const activeCfg = active ? (settings[active.set].buttons[active.id] || defaultSettings[active.id] || emptySetting) : null;
    const currentBackground = settings[view].background || defaultBackground;
    const { hex: backgroundHex, alpha: backgroundAlpha } = parseBackgroundColor(currentBackground);
    const currentMode = getCurrentMode();
    const isOverrideMode = view !== 'solo';

    return (
        <div onClick={close} className="w-100 position-relative">
            <div className="mobile-buttons-top-row">
                <div className="mobile-buttons-mode-toggle">
                    <Button
                        size="sm"
                        variant={view === 'solo' ? 'primary' : 'secondary'}
                        onClick={() => changeView('solo')}
                        title={currentMode === 'solo' ? 'Aktualny tryb' : undefined}
                    >
                        Bazowy{currentMode === 'solo' ? ' •' : ''}
                    </Button>
                    <Button
                        size="sm"
                        variant={view === 'team' ? 'primary' : 'secondary'}
                        onClick={() => changeView('team')}
                        title={currentMode === 'team' ? 'Aktualny tryb' : undefined}
                    >
                        W druzynie{currentMode === 'team' ? ' •' : ''}
                    </Button>
                    <Button
                        size="sm"
                        variant={view === 'leader' ? 'primary' : 'secondary'}
                        onClick={() => changeView('leader')}
                        title={currentMode === 'leader' ? 'Aktualny tryb' : undefined}
                    >
                        Prowadzacy{currentMode === 'leader' ? ' •' : ''}
                    </Button>
                </div>
                <div className="d-flex align-items-center gap-2">
                    <Button size="sm" variant="outline-secondary" onClick={resetPosition}>
                        Resetuj pozycje
                    </Button>
                    <Form.Check
                        id="mobile-buttons-lock"
                        type="switch"
                        className="user-select-none"
                        label="Zablokuj"
                        checked={settings.locked}
                        onChange={e => setSettings(prev => ({ ...prev, locked: e.target.checked }))}
                    />
                </div>
            </div>

            {isOverrideMode && (
                <div className="alert alert-info py-2 px-3 small mb-2" onClick={ev => ev.stopPropagation()}>
                    Ten tryb dziedziczy z trybu Bazowy. Zmiany ponizej sa zapisywane jako nadpisania. Uzyj "Resetuj nadpisania", aby przywrocic pelne dziedziczenie.
                </div>
            )}

            {/* Button size and gap section */}
            <div
                className="mobile-buttons-background-section"
                onClick={ev => ev.stopPropagation()}
                onMouseDown={ev => ev.stopPropagation()}
                onTouchStart={ev => ev.stopPropagation()}
            >
                <Form.Label>Rozmiar przycisku</Form.Label>
                <div className="mobile-buttons-background-controls">
                    <Form.Range
                        className="flex-grow-1"
                        min={20}
                        max={80}
                        value={settings.buttonSize ?? defaultButtonSize}
                        onChange={e => setSettings(prev => ({ ...prev, buttonSize: Number(e.target.value) }))}
                    />
                    <span className="mobile-buttons-background-alpha-value">{settings.buttonSize ?? defaultButtonSize}px</span>
                    <Button
                        size="sm"
                        variant="outline-secondary"
                        data-testid="reset-button-size"
                        onClick={() => setSettings(prev => ({ ...prev, buttonSize: defaultButtonSize }))}
                    >
                        ↺
                    </Button>
                </div>
                <Form.Label className="mt-2">Odstep</Form.Label>
                <div className="mobile-buttons-background-controls">
                    <Form.Range
                        className="flex-grow-1"
                        min={0}
                        max={20}
                        value={settings.buttonGap ?? defaultButtonGap}
                        onChange={e => setSettings(prev => ({ ...prev, buttonGap: Number(e.target.value) }))}
                    />
                    <span className="mobile-buttons-background-alpha-value">{settings.buttonGap ?? defaultButtonGap}px</span>
                    <Button
                        size="sm"
                        variant="outline-secondary"
                        data-testid="reset-button-gap"
                        onClick={() => setSettings(prev => ({ ...prev, buttonGap: defaultButtonGap }))}
                    >
                        ↺
                    </Button>
                </div>
            </div>

            {/* Button grid with spatial controls */}
            <div className="d-flex flex-column align-items-center mb-3">
                <div className="d-flex gap-1 mb-2">
                    <Button size="sm" variant="outline-secondary" onClick={() => addRow('top')} title="Dodaj wiersz">+</Button>
                    <Button size="sm" variant="outline-secondary" onClick={() => removeRow('top')} title="Usun wiersz">-</Button>
                </div>
                <div className="d-flex align-items-center gap-2">
                    <div className="d-flex flex-column gap-1">
                        <Button size="sm" variant="outline-secondary" onClick={() => addCol('left')} title="Dodaj kolumne">+</Button>
                        <Button size="sm" variant="outline-secondary" onClick={() => removeCol('left')} title="Usun kolumne">-</Button>
                    </div>
                    <div>
                        {modes.map(mode => (
                            <ButtonGrid
                                key={mode}
                                mode={mode}
                                view={view}
                                settings={settings}
                                notEditable={notEditable}
                                emptySetting={emptySetting}
                                openConfig={openConfig}
                                gridRef={refs[mode]}
                                activeButtonId={active?.id}
                            />
                        ))}
                    </div>
                    <div className="d-flex flex-column gap-1">
                        <Button size="sm" variant="outline-secondary" onClick={() => addCol('right')} title="Dodaj kolumne">+</Button>
                        <Button size="sm" variant="outline-secondary" onClick={() => removeCol('right')} title="Usun kolumne">-</Button>
                    </div>
                </div>
                <div className="d-flex gap-1 mt-2">
                    <Button size="sm" variant="outline-secondary" onClick={() => addRow('bottom')} title="Dodaj wiersz">+</Button>
                    <Button size="sm" variant="outline-secondary" onClick={() => removeRow('bottom')} title="Usun wiersz">-</Button>
                </div>
            </div>

            {/* Background picker section */}
            <div
                className="mobile-buttons-background-section"
                onClick={ev => ev.stopPropagation()}
                onMouseDown={ev => ev.stopPropagation()}
                onTouchStart={ev => ev.stopPropagation()}
            >
                <Form.Label>Kolor tla</Form.Label>
                <div className="mobile-buttons-background-controls">
                    <Form.Control
                        type="color"
                        className="mobile-buttons-background-color"
                        value={backgroundHex}
                        onChange={e => {
                            const hex = e.target.value;
                            updateSettings(prev => {
                                const bg = prev[view].background || defaultBackground;
                                const { alpha } = parseBackgroundColor(bg);
                                return {
                                    ...prev,
                                    [view]: {
                                        ...prev[view],
                                        background: rgbaFromHexAlpha(hex, alpha),
                                    },
                                };
                            });
                        }}
                    />
                    <div className="mobile-buttons-background-alpha">
                        <Form.Range
                            className="flex-grow-1"
                            min={0}
                            max={100}
                            value={Math.round(backgroundAlpha * 100)}
                            onChange={e => {
                                const alphaValue = Number(e.target.value) / 100;
                                updateSettings(prev => {
                                    const bg = prev[view].background || defaultBackground;
                                    const { hex } = parseBackgroundColor(bg);
                                    return {
                                        ...prev,
                                        [view]: {
                                            ...prev[view],
                                            background: rgbaFromHexAlpha(hex, alphaValue),
                                        },
                                    };
                                });
                            }}
                        />
                        <span className="mobile-buttons-background-alpha-value">{Math.round(backgroundAlpha * 100)}%</span>
                    </div>
                    <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => {
                            updateSettings(prev => ({
                                ...prev,
                                [view]: { ...prev[view], background: defaultBackground },
                            }));
                        }}
                    >
                        ↺
                    </Button>
                </div>
            </div>
            {/* Mobile backdrop */}
            {active && (
                <div
                    className={`mobile-button-config-backdrop ${configOpen ? 'open' : ''}`}
                    onClick={close}
                />
            )}
            {active && activeCfg && (
                <div
                    className={`mobile-button-config ${configOpen ? 'open' : ''}`}
                    style={isMobile ? undefined : { left: pos.left, top: pos.top }}
                    onClick={ev => ev.stopPropagation()}
                >
                    {/* Header */}
                    <div className="mobile-button-config-header">
                        <h6 className="mobile-button-config-header-title">Konfiguracja przycisku</h6>
                        <button type="button" className="btn-close" onClick={close} />
                    </div>

                    {/* Body */}
                    <div className="mobile-button-config-body">
                        {/* Basic settings section */}
                        <div className="mobile-button-config-section">
                            <div className="mobile-button-config-section-title">Podstawowe</div>
                            <div className="mobile-button-config-row">
                                <Form.Label>Makro</Form.Label>
                                <MacroSelect
                                    value={activeCfg.macroType}
                                    onChange={val => {
                                        if (val === 'empty') {
                                            makeBlank(active!.set, active!.id);
                                        } else {
                                            update(active!.set, active!.id, 'macroType', val);
                                            if (val !== 'compound') {
                                                update(active!.set, active!.id, 'steps', undefined);
                                            }
                                        }
                                    }}
                                    pluginMacros={pluginMacros}
                                    showUnavailableWarning
                                    className="mobile-button-macro"
                                />
                            </div>
                            {!isButtonMacroAvailable(activeCfg.macroType) && (
                                <Form.Text className="text-warning">
                                    Ta wtyczka nie jest zaladowana. Makro nie bedzie dzialac.
                                </Form.Text>
                            )}
                            {activeCfg.macroType !== 'empty' && (
                                <div className="mobile-button-config-row">
                                    <Form.Label>Etykieta</Form.Label>
                                    <Form.Control
                                        size="sm"
                                        className="mobile-button-label"
                                        type="text"
                                        value={activeCfg.label}
                                        onChange={e => update(active!.set, active!.id, 'label', e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Macro-specific options via shared component */}
                        {activeCfg.macroType !== 'empty' && (
                            <MacroConfigEditor
                                config={activeCfg}
                                onChange={updates => {
                                    const setName = active!.set;
                                    const id = active!.id;
                                    Object.entries(updates).forEach(([key, value]) => {
                                        update(setName, id, key as keyof MobileButtonSetting, value);
                                    });
                                }}
                                pluginMacros={pluginMacros}
                                buttonColor={activeCfg.color}
                            />
                        )}

                        {/* Appearance section */}
                        {activeCfg.macroType !== 'empty' && (
                            <div className="mobile-button-config-section">
                                <div className="mobile-button-config-section-title">Wyglad</div>
                                <div className="mobile-button-color-row">
                                    <Form.Label>Kolor</Form.Label>
                                    <Form.Control
                                        size="sm"
                                        type="color"
                                        value={activeCfg.color}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (syncDirs && activeCfg.macroType === 'kierunek') {
                                                updateAllDirections('color', val);
                                            } else {
                                                update(active!.set, active!.id, 'color', val);
                                            }
                                        }}
                                    />
                                    <Button size="sm" variant="outline-secondary" onClick={() => resetColor(active!.set, active!.id)}>↺</Button>
                                </div>
                                <div className="mobile-button-color-row">
                                    <Form.Label>Kolor czcionki</Form.Label>
                                    <Form.Control
                                        size="sm"
                                        type="color"
                                        value={activeCfg.fontColor || defaultSettings[active!.id]?.fontColor || defaultFontColor}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (syncDirs && activeCfg.macroType === 'kierunek') {
                                                updateAllDirections('fontColor', val);
                                            } else {
                                                update(active!.set, active!.id, 'fontColor', val);
                                            }
                                        }}
                                    />
                                    <Button size="sm" variant="outline-secondary" onClick={() => resetFontColor(active!.set, active!.id)}>↺</Button>
                                </div>
                                {activeCfg.macroType === 'kierunek' && (
                                    <div className="mobile-button-color-row">
                                        <Form.Label>Kolor aktywny</Form.Label>
                                        <Form.Control
                                            size="sm"
                                            type="color"
                                            value={activeCfg.activeColor || defaultSettings[active!.id]?.activeColor || '#2fa7c5'}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (syncDirs) {
                                                    updateAllDirections('activeColor', val);
                                                } else {
                                                    update(active!.set, active!.id, 'activeColor', val);
                                                }
                                            }}
                                        />
                                        <Button size="sm" variant="outline-secondary" onClick={() => resetActiveColor(active!.set, active!.id)}>↺</Button>
                                    </div>
                                )}
                                {activeCfg.macroType === 'kierunek' && (
                                    <Form.Check
                                        type="checkbox"
                                        label="Synchronizuj kolory kierunkow"
                                        checked={syncDirs}
                                        onChange={e => setSyncDirs(e.target.checked)}
                                    />
                                )}
                            </div>
                        )}

                        {activeCfg.macroType === "specialExit" && (
                            <div className="mobile-button-config-section">
                                <div className="mobile-button-config-section-title">Opcje</div>
                                <Form.Check
                                    type="checkbox"
                                    label="Synchronizuj z kierunkami"
                                    checked={activeCfg.syncWithDirections || false}
                                    onChange={e => update(active!.set, active!.id, "syncWithDirections", e.target.checked)}
                                />
                                {!activeCfg.syncWithDirections && (
                                    <div className="mobile-button-color-row">
                                        <Form.Label>Kolor aktywny</Form.Label>
                                        <Form.Control
                                            size="sm"
                                            type="color"
                                            value={activeCfg.activeColor || '#2fa7c5'}
                                            onChange={e => update(active!.set, active!.id, 'activeColor', e.target.value)}
                                        />
                                        <Button size="sm" variant="outline-secondary" onClick={() => update(active!.set, active!.id, 'activeColor', '#2fa7c5')}>↺</Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Hold action configuration */}
                        {activeCfg.macroType !== 'empty' && (
                            <HoldConfig
                                holdEnabled={activeCfg.holdEnabled || false}
                                hold={activeCfg.hold}
                                onToggle={enabled => update(active!.set, active!.id, 'holdEnabled', enabled)}
                                onChangeHold={hold => update(active!.set, active!.id, 'hold', hold)}
                                pluginMacros={pluginMacros}
                                locked={settings.locked}
                                idSuffix={active!.id}
                            />
                        )}
                    </div>
                </div>
            )}
            <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                <Button size="sm" variant="outline-secondary" onClick={() => restoreDefaults(view)}>
                    Domyslne
                </Button>
                {isOverrideMode && (
                    <Button size="sm" variant="outline-secondary" onClick={resetOverrides} title="Wyczysc nadpisania i odziedzicz wszystko z trybu Bazowy">
                        Resetuj nadpisania
                    </Button>
                )}
                <Form.Select
                    size="sm"
                    value={copyFrom}
                    onChange={e => setCopyFrom(e.target.value as Mode)}
                    style={{ width: 'auto', minWidth: '120px' }}
                >
                    <option value="solo">Bazowy</option>
                    <option value="team">W druzynie</option>
                    <option value="leader">Prowadzacy</option>
                </Form.Select>
                <Button size="sm" variant="secondary" onClick={() => copyLayout(copyFrom)}>
                    Kopiuj
                </Button>
                <Button id="mobile-buttons-save" size="sm" variant="primary" className="ms-auto" onClick={save}>Zapisz</Button>
            </div>
        </div>
    );
}

export default MobileButtons;
