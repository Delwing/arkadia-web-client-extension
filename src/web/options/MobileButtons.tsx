import {RefObject, useEffect, useRef, useState} from "react";
import {Button, Check, Field, Input, Select} from "@web-ui/primitives/index.ts";
import {
    applySettings,
    createDefaultLayout,
    defaultBackground,
    defaultButtonGap,
    defaultButtonSize,
    defaultSettings,
    loadSettings,
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
import { SettingsValue } from "@web/settings/SettingsValue.tsx";

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

const CONFIG_WIDTH = 380;
const CONFIG_MIN_HEIGHT = 360;
const VIEWPORT_MARGIN = 8;

/**
 * Viewport coordinates for the desktop config popup: under the clicked button,
 * but moved up and left as far as needed to keep a usable popup on screen —
 * a button low on a scrolled settings page would otherwise open it below the
 * window's bottom edge.
 */
function configPosition(anchor: DOMRect) {
    const { innerWidth, innerHeight } = window;
    const tallest = innerHeight * 0.7;
    const top = Math.max(VIEWPORT_MARGIN, Math.min(
        anchor.bottom + 4,
        innerHeight - VIEWPORT_MARGIN - Math.min(CONFIG_MIN_HEIGHT, tallest),
    ));
    const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, innerWidth - VIEWPORT_MARGIN - CONFIG_WIDTH));
    return { left, top, maxHeight: Math.min(tallest, innerHeight - VIEWPORT_MARGIN - top) };
}

const modes: Mode[] = ['solo', 'team', 'leader'];

/**
 * The "Przyciski mobilne" settings page. Edits stay local until the settings
 * dialog's Save runs the callback given to `registerSave`; the dialog remounts
 * the editor on open, which is how unsaved edits are dropped.
 */
function MobileButtons({ registerSave }: { registerSave: (save: () => void) => void }) {
    const [stored] = useState(() => JSON.stringify(loadSettings()));
    const [settings, setSettings] = useState<Settings>(() => JSON.parse(stored));
    const [syncDirs, setSyncDirs] = useState(true);
    const [active, setActive] = useState<{ set: Mode; id: string } | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number }>({ left: 0, top: 0, maxHeight: 0 });
    const [pluginMacros, setPluginMacros] = useState<PluginButtonMacro[]>([]);
    const [view, setView] = useState<Mode>('solo');
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
        registerSave(() => {
            // Untouched: leave storage (and the live buttons) alone.
            if (JSON.stringify(settings) === stored) return;
            // The radial menu shares this entry but is edited in "Menu kołowe".
            const next = { ...settings, radial: loadSettings().radial };
            saveSettings(next);
            const { isInAnyTeam, isLeader } = getTeamState();
            applySettings(next, isInAnyTeam, isLeader);
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

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);
    const notEditable: string[] = [];

    function nextId(ids: string[]) {
        let current = ids.reduce((m, id) => {
            const match = /^button-(\d+)$/.exec(id);
            return match ? Math.max(m, parseInt(match[1], 10)) : m;
        }, 3);
        return () => `button-${++current}`;
    }

    function addRow(pos: 'top' | 'bottom') {
        setSettings(prev => {
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
        setSettings(prev => {
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
        setSettings(prev => {
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
        setSettings(prev => {
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
        setPos(configPosition(ev.currentTarget.getBoundingClientRect()));
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
        setSettings(prev => ({
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
        setSettings(prev => {
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
        setSettings(prev => ({
            ...prev,
            [setName]: {
                ...prev[setName],
                buttons: { ...prev[setName].buttons, [id]: { ...emptySetting } },
            },
        }));
    }

    function restoreDefaults(setName: Mode) {
        setSettings(prev => ({
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
        setSettings(prev => ({ ...prev, [to]: JSON.parse(JSON.stringify(prev[from])) }));
    }

    const activeCfg = active ? (settings[active.set].buttons[active.id] || defaultSettings[active.id] || emptySetting) : null;
    const currentBackground = settings[view].background || defaultBackground;
    const { hex: backgroundHex, alpha: backgroundAlpha } = parseBackgroundColor(currentBackground);

    const stop = {
        onClick: (ev: React.SyntheticEvent) => ev.stopPropagation(),
        onMouseDown: (ev: React.SyntheticEvent) => ev.stopPropagation(),
        onTouchStart: (ev: React.SyntheticEvent) => ev.stopPropagation(),
    };

    function colorRow(label: string, value: string, onChange: (v: string) => void, onReset: () => void) {
        return (
            <div className="mobile-button-color-row">
                <span className="popup-field__label">{label}</span>
                <input type="color" className="popup-color" value={value} onChange={e => onChange(e.target.value)} />
                <Button size="sm" variant="ghost" title="Przywróć domyślny kolor" onClick={onReset}>↺</Button>
            </div>
        );
    }

    const gridButton = (label: string, title: string, onClick: () => void) => (
        <Button size="sm" variant="ghost" className="popup-btn--icon" title={title} onClick={onClick}>{label}</Button>
    );

    return (
        <>
            <SettingsValue value={settings} />
            <div onClick={close} className="mobile-buttons-editor" data-settings-ignore>
                <div className="mobile-buttons-top-row">
                    <div className="dialog-tabs">
                        {([['solo', 'Bez druzyny'], ['team', 'W druzynie'], ['leader', 'Prowadzacy']] as const).map(([mode, label]) => (
                            <button
                                key={mode}
                                type="button"
                                className={`dialog-tab${view === mode ? ' is-active' : ''}`}
                                onClick={() => changeView(mode)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="popup-inline">
                        <Button size="sm" onClick={resetPosition}>
                            Resetuj pozycje
                        </Button>
                        <Check
                            id="mobile-buttons-lock"
                            label="Zablokuj"
                            checked={settings.locked}
                            onChange={e => setSettings(prev => ({ ...prev, locked: e.target.checked }))}
                        />
                    </div>
                </div>

                {/* Button size and gap */}
                <div className="mobile-buttons-background-section" {...stop}>
                    <div className="mobile-buttons-slider-row">
                        <span className="popup-field__label">Rozmiar przycisku</span>
                        <input
                            type="range"
                            className="popup-range"
                            min={20}
                            max={80}
                            value={settings.buttonSize ?? defaultButtonSize}
                            onChange={e => setSettings(prev => ({ ...prev, buttonSize: Number(e.target.value) }))}
                        />
                        <span className="mobile-buttons-background-alpha-value">{settings.buttonSize ?? defaultButtonSize}px</span>
                        <Button
                            size="sm"
                            variant="ghost"
                            title="Przywróć domyślne"
                            data-testid="reset-button-size"
                            onClick={() => setSettings(prev => ({ ...prev, buttonSize: defaultButtonSize }))}
                        >
                            ↺
                        </Button>
                    </div>
                    <div className="mobile-buttons-slider-row">
                        <span className="popup-field__label">Odstep</span>
                        <input
                            type="range"
                            className="popup-range"
                            min={0}
                            max={20}
                            value={settings.buttonGap ?? defaultButtonGap}
                            onChange={e => setSettings(prev => ({ ...prev, buttonGap: Number(e.target.value) }))}
                        />
                        <span className="mobile-buttons-background-alpha-value">{settings.buttonGap ?? defaultButtonGap}px</span>
                        <Button
                            size="sm"
                            variant="ghost"
                            title="Przywróć domyślne"
                            data-testid="reset-button-gap"
                            onClick={() => setSettings(prev => ({ ...prev, buttonGap: defaultButtonGap }))}
                        >
                            ↺
                        </Button>
                    </div>
                    <div className="mobile-buttons-slider-row">
                        <span className="popup-field__label">Kolor tla</span>
                        <div className="popup-inline">
                            <input
                                type="color"
                                className="popup-color"
                                value={backgroundHex}
                                onChange={e => {
                                    const hex = e.target.value;
                                    setSettings(prev => {
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
                            <input
                                type="range"
                                className="popup-range"
                                title="Krycie tla"
                                min={0}
                                max={100}
                                value={Math.round(backgroundAlpha * 100)}
                                onChange={e => {
                                    const alphaValue = Number(e.target.value) / 100;
                                    setSettings(prev => {
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
                        </div>
                        <span className="mobile-buttons-background-alpha-value">{Math.round(backgroundAlpha * 100)}%</span>
                        <Button
                            size="sm"
                            variant="ghost"
                            title="Przywróć domyślne"
                            onClick={() => {
                                setSettings(prev => ({
                                    ...prev,
                                    [view]: { ...prev[view], background: defaultBackground },
                                }));
                            }}
                        >
                            ↺
                        </Button>
                    </div>
                </div>

                {/* Button grid with +/- for rows and columns on each side */}
                <div className="mobile-buttons-grid-editor">
                    <div className="mobile-buttons-grid-editor__edge">
                        {gridButton('+', 'Dodaj wiersz', () => addRow('top'))}
                        {gridButton('-', 'Usun wiersz', () => removeRow('top'))}
                    </div>
                    <div className="mobile-buttons-grid-editor__middle">
                        <div className="mobile-buttons-grid-editor__edge mobile-buttons-grid-editor__edge--side">
                            {gridButton('+', 'Dodaj kolumne', () => addCol('left'))}
                            {gridButton('-', 'Usun kolumne', () => removeCol('left'))}
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
                        <div className="mobile-buttons-grid-editor__edge mobile-buttons-grid-editor__edge--side">
                            {gridButton('+', 'Dodaj kolumne', () => addCol('right'))}
                            {gridButton('-', 'Usun kolumne', () => removeCol('right'))}
                        </div>
                    </div>
                    <div className="mobile-buttons-grid-editor__edge">
                        {gridButton('+', 'Dodaj wiersz', () => addRow('bottom'))}
                        {gridButton('-', 'Usun wiersz', () => removeRow('bottom'))}
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
                        style={isMobile ? undefined : pos}
                        onClick={ev => ev.stopPropagation()}
                    >
                        <div className="mobile-button-config-header">
                            <h6 className="mobile-button-config-header-title">Konfiguracja przycisku</h6>
                            <button type="button" className="popup-dialog__close mobile-button-config__close" title="Zamknij" onClick={close}>×</button>
                        </div>

                        <div className="mobile-button-config-body">
                            <div className="mobile-button-config-section">
                                <div className="mobile-button-config-section-title">Podstawowe</div>
                                <Field
                                    label="Makro"
                                    error={isButtonMacroAvailable(activeCfg.macroType) ? undefined : "Ta wtyczka nie jest zaladowana. Makro nie bedzie dzialac."}
                                >
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
                                </Field>
                                {activeCfg.macroType !== 'empty' && (
                                    <Field label="Etykieta">
                                        <Input
                                            className="mobile-button-label"
                                            value={activeCfg.label}
                                            onChange={e => update(active!.set, active!.id, 'label', e.target.value)}
                                        />
                                    </Field>
                                )}
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
                            </div>

                            {activeCfg.macroType !== 'empty' && (
                                <div className="mobile-button-config-section">
                                    <div className="mobile-button-config-section-title">Wyglad</div>
                                    {colorRow("Kolor", activeCfg.color, val => {
                                        if (syncDirs && activeCfg.macroType === 'kierunek') {
                                            updateAllDirections('color', val);
                                        } else {
                                            update(active!.set, active!.id, 'color', val);
                                        }
                                    }, () => resetColor(active!.set, active!.id))}
                                    {colorRow("Kolor czcionki", activeCfg.fontColor || defaultSettings[active!.id]?.fontColor || defaultFontColor, val => {
                                        if (syncDirs && activeCfg.macroType === 'kierunek') {
                                            updateAllDirections('fontColor', val);
                                        } else {
                                            update(active!.set, active!.id, 'fontColor', val);
                                        }
                                    }, () => resetFontColor(active!.set, active!.id))}
                                    {activeCfg.macroType === 'kierunek' && colorRow("Kolor aktywny", activeCfg.activeColor || defaultSettings[active!.id]?.activeColor || '#2fa7c5', val => {
                                        if (syncDirs) {
                                            updateAllDirections('activeColor', val);
                                        } else {
                                            update(active!.set, active!.id, 'activeColor', val);
                                        }
                                    }, () => resetActiveColor(active!.set, active!.id))}
                                    {activeCfg.macroType === 'kierunek' && (
                                        <Check
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
                                    <Check
                                        label="Synchronizuj z kierunkami"
                                        checked={activeCfg.syncWithDirections || false}
                                        onChange={e => update(active!.set, active!.id, "syncWithDirections", e.target.checked)}
                                    />
                                    {!activeCfg.syncWithDirections && colorRow(
                                        "Kolor aktywny",
                                        activeCfg.activeColor || '#2fa7c5',
                                        val => update(active!.set, active!.id, 'activeColor', val),
                                        () => update(active!.set, active!.id, 'activeColor', '#2fa7c5'),
                                    )}
                                </div>
                            )}

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
                <div className="popup-inline settings-wrap mobile-buttons-footer">
                    <Button size="sm" onClick={() => restoreDefaults(view)}>
                        Domyslne
                    </Button>
                    <span className="settings-inline-note">Kopiuj uklad z</span>
                    <Select
                        className="settings-narrow"
                        value={copyFrom}
                        onChange={e => setCopyFrom(e.target.value as Mode)}
                    >
                        <option value="solo">Bez druzyny</option>
                        <option value="team">W druzynie</option>
                        <option value="leader">Prowadzacy</option>
                    </Select>
                    <Button size="sm" onClick={() => copyLayout(copyFrom)}>
                        Kopiuj
                    </Button>
                </div>
            </div>
        </>
    );
}

export default MobileButtons;
