import {RefObject, useEffect, useRef, useState} from "react";
import {Alert, Button, Form} from "react-bootstrap";
import {
    applySettings,
    ButtonSetting,
    createDefaultLayout,
    defaultBackground,
    defaultButtonGap,
    defaultButtonSize,
    defaultCols,
    defaultFontColor,
    defaultOrder,
    defaultSettings,
    loadSettings,
    MacroType,
    saveSettings,
    Settings,
} from "../mobileButtonSettings";
import {getTeamState} from "@modules/core/teamStateProvider";
import {
    getRegisteredButtonMacros,
    isButtonMacroAvailable,
    getMacroStates,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";
import eventBus from "@modules/core/eventBus";

import ButtonGrid, {Mode} from "./ButtonGrid";

const macroOptions: { value: MacroType; label: string }[] = [
    { value: "functional", label: "Bind funkcyjny" },
    { value: "zList", label: "Lista /z" },
    { value: "zaList", label: "Lista /za" },
    { value: "wList", label: "Lista /w" },
    { value: "przeList", label: "Lista /prze" },
    { value: "idzList", label: "Lista idz" },
    { value: "command", label: "Wyślij komendę" },
    { value: "kierunek", label: "Kierunek" },
    { value: "specialExit", label: "Wyjście specjalne" },
    { value: "wesprzyj", label: "Wesprzyj prowadzącego" },
    { value: "moveMode", label: "Tryb ruchu" },
    { value: "toggleButtons", label: "Przełącz przyciski" },
    { value: "attackEnemy", label: "Atakuj wroga" },
    { value: "blockEnemy", label: "Zablokuj wroga" },
    { value: "attackAllEnemies", label: "Atakuj wszystkich wrogow" },
    { value: "mute", label: "Wycisz dzwieki" },
    { value: "unmute", label: "Wlacz dzwieki" },
    { value: "compound", label: "Złożone (wiele akcji)" },
    { value: "empty", label: "Puste" },
];

const directionOptions = ["nw","n","ne","w","e","sw","s","se","u","d"] as const;

const emptySetting: ButtonSetting = { macro: 'empty', label: '', color: 'transparent', fontColor: defaultFontColor };

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

type SettingsMap = Record<string, ButtonSetting>;

const modes: Mode[] = ['solo', 'team', 'leader'];

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
        const rect = ev.currentTarget.getBoundingClientRect();
        // Use viewport coordinates for fixed positioning
        setPos({ left: rect.left, top: rect.bottom + 4 });
        setActive({ set: setName, id });
        setConfigOpen(true);
        const cfg = settings[setName].buttons[id] || defaultSettings[id] || emptySetting;
        if (cfg.macro === 'kierunek') {
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

    function update(setName: Mode, id: string, field: keyof ButtonSetting, value: any) {
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
                    if (cfg.macro === 'kierunek') {
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
        if (syncDirs && (settings[setName].buttons[id]?.macro === 'kierunek' || defaultSettings[id]?.macro === 'kierunek')) {
            updateAllDirections('color', def);
        } else {
            update(setName, id, 'color', def);
        }
    }

    function resetActiveColor(setName: Mode, id: string) {
        const def = defaultSettings[id]?.activeColor || '#2fa7c5';
        if (syncDirs && (settings[setName].buttons[id]?.macro === 'kierunek' || defaultSettings[id]?.macro === 'kierunek')) {
            updateAllDirections('activeColor', def);
        } else {
            update(setName, id, 'activeColor', def);
        }
    }

    function resetFontColor(setName: Mode, id: string) {
        const def = defaultSettings[id]?.fontColor || defaultFontColor;
        if (syncDirs && (settings[setName].buttons[id]?.macro === 'kierunek' || defaultSettings[id]?.macro === 'kierunek')) {
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

    function copyLayout(from: Mode) {
        const to = view;
        if (from === to) return;
        setSettings(prev => ({ ...prev, [to]: JSON.parse(JSON.stringify(prev[from])) }));
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

    return (
        <div onClick={close} className="w-100 position-relative">
            <div className="mobile-buttons-top-row">
                <div className="mobile-buttons-mode-toggle">
                    <Button
                        size="sm"
                        variant={view === 'solo' ? 'primary' : 'secondary'}
                        onClick={() => changeView('solo')}
                    >
                        Bez druzyny
                    </Button>
                    <Button
                        size="sm"
                        variant={view === 'team' ? 'primary' : 'secondary'}
                        onClick={() => changeView('team')}
                    >
                        W druzynie
                    </Button>
                    <Button
                        size="sm"
                        variant={view === 'leader' ? 'primary' : 'secondary'}
                        onClick={() => changeView('leader')}
                    >
                        Prowadzacy
                    </Button>
                </div>
                <Form.Check
                    id="mobile-buttons-lock"
                    type="switch"
                    className="user-select-none"
                    label="Zablokuj"
                    checked={settings.locked}
                    onChange={e => setSettings(prev => ({ ...prev, locked: e.target.checked }))}
                />
            </div>

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
                    <div className="mobile-buttons-background-alpha">
                        <Form.Range
                            className="flex-grow-1"
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
                        <span className="mobile-buttons-background-alpha-value">{Math.round(backgroundAlpha * 100)}%</span>
                    </div>
                    <Button
                        size="sm"
                        variant="outline-secondary"
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
                                <Form.Select
                                    size="sm"
                                    className={`mobile-button-macro ${!isButtonMacroAvailable(activeCfg.macro) ? 'border-warning' : ''}`}
                                    value={activeCfg.macro}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val === 'empty') {
                                            makeBlank(active!.set, active!.id);
                                        } else {
                                            update(active!.set, active!.id, 'macro', val);
                                            if (val !== 'compound') {
                                                update(active!.set, active!.id, 'steps', undefined);
                                            }
                                        }
                                    }}
                                >
                                    {macroOptions.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                    {(() => {
                                        const byPlugin = new Map<string, typeof pluginMacros>();
                                        for (const pm of pluginMacros) {
                                            const key = pm.pluginName || pm.pluginId;
                                            if (!byPlugin.has(key)) byPlugin.set(key, []);
                                            byPlugin.get(key)!.push(pm);
                                        }
                                        return Array.from(byPlugin.entries()).map(([pluginName, macros]) => (
                                            <optgroup key={pluginName} label={pluginName}>
                                                {macros.map(pm => (
                                                    <option key={pm.id} value={pm.id}>{pm.label}</option>
                                                ))}
                                            </optgroup>
                                        ));
                                    })()}
                                    {activeCfg.macro.startsWith('plugin:') && !isButtonMacroAvailable(activeCfg.macro) && (
                                        <option value={activeCfg.macro} disabled>
                                            {activeCfg.macro} (wtyczka niedostepna)
                                        </option>
                                    )}
                                </Form.Select>
                            </div>
                            {!isButtonMacroAvailable(activeCfg.macro) && (
                                <Form.Text className="text-warning">
                                    Ta wtyczka nie jest zaladowana. Makro nie bedzie dzialac.
                                </Form.Text>
                            )}
                            {activeCfg.macro !== 'empty' && (
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

                        {activeCfg.macro === "compound" && (
                            <div className="mobile-button-config-section">
                                <div className="mobile-button-config-section-title">Kroki</div>
                                {(activeCfg.steps || []).map((step, index) => (
                                    <div key={index} className="mb-2 p-2 border rounded">
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <span className="small fw-bold">Krok {index + 1}</span>
                                            <div className="d-flex gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    disabled={index === 0}
                                                    onClick={() => {
                                                        const steps = [...(activeCfg.steps || [])];
                                                        [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
                                                        update(active!.set, active!.id, 'steps', steps);
                                                    }}
                                                >^</Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    disabled={index === (activeCfg.steps || []).length - 1}
                                                    onClick={() => {
                                                        const steps = [...(activeCfg.steps || [])];
                                                        [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
                                                        update(active!.set, active!.id, 'steps', steps);
                                                    }}
                                                >v</Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline-danger"
                                                    onClick={() => {
                                                        const steps = (activeCfg.steps || []).filter((_, i) => i !== index);
                                                        update(active!.set, active!.id, 'steps', steps);
                                                    }}
                                                >X</Button>
                                            </div>
                                        </div>
                                        <Form.Select
                                            size="sm"
                                            className="mb-1"
                                            value={step.macro}
                                            onChange={e => {
                                                const steps = [...(activeCfg.steps || [])];
                                                steps[index] = { ...steps[index], macro: e.target.value };
                                                update(active!.set, active!.id, 'steps', steps);
                                            }}
                                        >
                                            {macroOptions.filter(o => o.value !== 'empty' && o.value !== 'compound').map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                            {(() => {
                                                const byPlugin = new Map<string, typeof pluginMacros>();
                                                for (const pm of pluginMacros) {
                                                    const key = pm.pluginName || pm.pluginId;
                                                    if (!byPlugin.has(key)) byPlugin.set(key, []);
                                                    byPlugin.get(key)!.push(pm);
                                                }
                                                return Array.from(byPlugin.entries()).map(([pluginName, macros]) => (
                                                    <optgroup key={pluginName} label={pluginName}>
                                                        {macros.map(pm => (
                                                            <option key={pm.id} value={pm.id}>{pm.label}</option>
                                                        ))}
                                                    </optgroup>
                                                ));
                                            })()}
                                        </Form.Select>
                                        {step.macro === 'command' && (
                                            <Form.Control
                                                as="textarea"
                                                size="sm"
                                                placeholder="Komenda"
                                                value={step.command || ''}
                                                onChange={e => {
                                                    const steps = [...(activeCfg.steps || [])];
                                                    steps[index] = { ...steps[index], command: e.target.value };
                                                    update(active!.set, active!.id, 'steps', steps);
                                                }}
                                                autoCorrect="off"
                                                autoComplete="off"
                                                autoCapitalize="off"
                                                spellCheck={false}
                                            />
                                        )}
                                        {step.macro === 'kierunek' && (
                                            <Form.Select
                                                size="sm"
                                                value={step.direction || 'n'}
                                                onChange={e => {
                                                    const steps = [...(activeCfg.steps || [])];
                                                    steps[index] = { ...steps[index], direction: e.target.value };
                                                    update(active!.set, active!.id, 'steps', steps);
                                                }}
                                            >
                                                {directionOptions.map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </Form.Select>
                                        )}
                                        {(step.macro === 'attackEnemy' || step.macro === 'blockEnemy') && (
                                            <Form.Select
                                                size="sm"
                                                value={step.enemySlot ?? 0}
                                                onChange={e => {
                                                    const steps = [...(activeCfg.steps || [])];
                                                    steps[index] = { ...steps[index], enemySlot: parseInt(e.target.value) };
                                                    update(active!.set, active!.id, 'steps', steps);
                                                }}
                                            >
                                                <option value={0}>Slot 1</option>
                                                <option value={1}>Slot 2</option>
                                                <option value={2}>Slot 3</option>
                                            </Form.Select>
                                        )}
                                    </div>
                                ))}
                                <Button
                                    size="sm"
                                    variant="outline-primary"
                                    className="w-100"
                                    onClick={() => {
                                        const steps = [...(activeCfg.steps || []), { macro: 'command' as MacroType, command: '' }];
                                        update(active!.set, active!.id, 'steps', steps);
                                    }}
                                >+ Dodaj krok</Button>
                            </div>
                        )}

                        {/* Appearance section */}
                        {activeCfg.macro !== 'empty' && (
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
                                            if (syncDirs && activeCfg.macro === 'kierunek') {
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
                                            if (syncDirs && activeCfg.macro === 'kierunek') {
                                                updateAllDirections('fontColor', val);
                                            } else {
                                                update(active!.set, active!.id, 'fontColor', val);
                                            }
                                        }}
                                    />
                                    <Button size="sm" variant="outline-secondary" onClick={() => resetFontColor(active!.set, active!.id)}>↺</Button>
                                </div>
                                {activeCfg.macro === 'kierunek' && (
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
                                {activeCfg.macro === 'kierunek' && (
                                    <Form.Check
                                        type="checkbox"
                                        label="Synchronizuj kolory kierunkow"
                                        checked={syncDirs}
                                        onChange={e => setSyncDirs(e.target.checked)}
                                    />
                                )}
                            </div>
                        )}

                        {/* Macro-specific options */}
                        {activeCfg.macro === "kierunek" && (
                            <div className="mobile-button-config-row">
                                <Form.Label>Kierunek</Form.Label>
                                <Form.Select
                                    size="sm"
                                    className="mobile-button-direction"
                                    value={activeCfg.direction || ""}
                                    onChange={e => update(active!.set, active!.id, "direction", e.target.value)}
                                >
                                    {directionOptions.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </Form.Select>
                            </div>
                        )}
                        {activeCfg.macro === "command" && (
                            <div className="mobile-button-config-row">
                                <Form.Label>Komenda</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    size="sm"
                                    className="mobile-button-command"
                                    value={activeCfg.command || ""}
                                    onChange={e => update(active!.set, active!.id, "command", e.target.value)}
                                    autoCorrect="off"
                                    autoComplete="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                        )}
                        {activeCfg.macro === "specialExit" && (
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
                        {(activeCfg.macro === "attackEnemy" || activeCfg.macro === "blockEnemy") && (
                            <div className="mobile-button-config-row">
                                <Form.Label>Slot wroga</Form.Label>
                                <Form.Select
                                    size="sm"
                                    value={activeCfg.enemySlot ?? 0}
                                    onChange={e => update(active!.set, active!.id, "enemySlot", parseInt(e.target.value))}
                                >
                                    <option value={0}>Slot 1</option>
                                    <option value={1}>Slot 2</option>
                                    <option value={2}>Slot 3</option>
                                </Form.Select>
                            </div>
                        )}
                        {/* Plugin macro config fields */}
                        {activeCfg.macro.startsWith('plugin:') && (() => {
                            const pluginMacro = pluginMacros.find(pm => pm.id === activeCfg.macro);
                            if (!pluginMacro?.configFields?.length) return null;
                            const config = activeCfg.pluginConfig || {};
                            return (
                                <div className="mobile-button-config-section">
                                    <div className="mobile-button-config-section-title">Konfiguracja wtyczki</div>
                                    {pluginMacro.configFields.map(field => (
                                        <div key={field.name} className={field.type === 'textarea' ? '' : 'mobile-button-config-row'}>
                                            <Form.Label>{field.label}</Form.Label>
                                            {field.type === 'text' && (
                                                <Form.Control
                                                    size="sm"
                                                    type="text"
                                                    value={config[field.name] ?? field.defaultValue ?? ''}
                                                    onChange={e => update(active!.set, active!.id, 'pluginConfig', { ...config, [field.name]: e.target.value })}
                                                />
                                            )}
                                            {field.type === 'textarea' && (
                                                <Form.Control
                                                    as="textarea"
                                                    size="sm"
                                                    rows={2}
                                                    value={config[field.name] ?? field.defaultValue ?? ''}
                                                    onChange={e => update(active!.set, active!.id, 'pluginConfig', { ...config, [field.name]: e.target.value })}
                                                />
                                            )}
                                            {field.type === 'number' && (
                                                <Form.Control
                                                    size="sm"
                                                    type="number"
                                                    value={config[field.name] ?? field.defaultValue ?? 0}
                                                    onChange={e => update(active!.set, active!.id, 'pluginConfig', { ...config, [field.name]: Number(e.target.value) })}
                                                />
                                            )}
                                            {field.type === 'select' && field.options && (
                                                <Form.Select
                                                    size="sm"
                                                    value={config[field.name] ?? field.defaultValue ?? ''}
                                                    onChange={e => update(active!.set, active!.id, 'pluginConfig', { ...config, [field.name]: e.target.value })}
                                                >
                                                    {field.options.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </Form.Select>
                                            )}
                                            {field.type === 'checkbox' && (
                                                <Form.Check
                                                    id={`plugin-config-mobile-${active!.id}-${field.name}`}
                                                    type="checkbox"
                                                    checked={config[field.name] ?? field.defaultValue ?? false}
                                                    onChange={e => update(active!.set, active!.id, 'pluginConfig', { ...config, [field.name]: e.target.checked })}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                        {/* State labels and colors for stateful plugin macros */}
                        {activeCfg.macro.startsWith('plugin:') && (() => {
                            const states = getMacroStates(activeCfg.macro);
                            if (!states?.length) return null;
                            const config = activeCfg.pluginConfig || {};
                            const stateLabels = (config.stateLabels || {}) as Record<string, string>;
                            const stateColors = (config.stateColors || {}) as Record<string, string>;
                            return (
                                <div className="mobile-button-config-section">
                                    <div className="mobile-button-config-section-title">Stany przycisku</div>
                                    {states.map(state => (
                                        <div key={state.id} className="mb-2">
                                            <div className="small text-muted mb-1">{state.id}</div>
                                            <div className="d-flex gap-1 align-items-center">
                                                <Form.Control
                                                    size="sm"
                                                    type="text"
                                                    placeholder={state.label}
                                                    value={stateLabels[state.id] ?? ''}
                                                    onChange={e => {
                                                        const newStateLabels = { ...stateLabels };
                                                        if (e.target.value) {
                                                            newStateLabels[state.id] = e.target.value;
                                                        } else {
                                                            delete newStateLabels[state.id];
                                                        }
                                                        update(active!.set, active!.id, 'pluginConfig', { ...config, stateLabels: newStateLabels });
                                                    }}
                                                />
                                                <Form.Control
                                                    size="sm"
                                                    type="color"
                                                    style={{ width: '40px', flexShrink: 0 }}
                                                    value={stateColors[state.id] || state.color || activeCfg.color}
                                                    onChange={e => {
                                                        const newStateColors = { ...stateColors };
                                                        newStateColors[state.id] = e.target.value;
                                                        update(active!.set, active!.id, 'pluginConfig', { ...config, stateColors: newStateColors });
                                                    }}
                                                />
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    onClick={() => {
                                                        const newStateColors = { ...stateColors };
                                                        delete newStateColors[state.id];
                                                        update(active!.set, active!.id, 'pluginConfig', { ...config, stateColors: newStateColors });
                                                    }}
                                                >
                                                    ↺
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

                        {/* Hold action configuration */}
                        {activeCfg.macro !== 'empty' && (() => {
                            const holdCfg = activeCfg.hold || { macro: 'command' };
                            const updateHold = (field: string, value: any) => {
                                update(active!.set, active!.id, 'hold', { ...holdCfg, [field]: value });
                            };
                            return (
                                <div className="mobile-button-config-hold-section">
                                    <Form.Check
                                        id={`hold-toggle-${active!.id}`}
                                        className="mobile-button-config-hold-toggle"
                                        type="checkbox"
                                        label="Przytrzymanie (hold)"
                                        checked={activeCfg.holdEnabled || false}
                                        onChange={e => update(active!.set, active!.id, 'holdEnabled', e.target.checked)}
                                    />
                                    {activeCfg.holdEnabled && !settings.locked && (
                                        <Alert variant="warning" className="py-1 px-2 mb-2 small">
                                            Odblokowane przyciski moga kolidowac z przytrzymaniem (przeciaganie po 1s).
                                        </Alert>
                                    )}
                                    {activeCfg.holdEnabled && (
                                        <div className="mobile-button-config-section">
                                            <div className="mobile-button-config-section-title">Opcje hold</div>
                                            <Form.Group className="mb-2">
                                                <Form.Label className="small mb-1">Makro (hold)</Form.Label>
                                                <Form.Select
                                                    size="sm"
                                                    className={`mobile-button-macro ${holdCfg.macro && !isButtonMacroAvailable(holdCfg.macro) ? 'border-warning' : ''}`}
                                                    value={holdCfg.macro || 'command'}
                                                    onChange={e => {
                                                        updateHold('macro', e.target.value);
                                                        if (e.target.value !== 'compound') {
                                                            updateHold('steps', undefined);
                                                        }
                                                    }}
                                                >
                                                    {macroOptions.filter(o => o.value !== 'empty').map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                    {(() => {
                                                        const byPlugin = new Map<string, typeof pluginMacros>();
                                                        for (const pm of pluginMacros) {
                                                            const key = pm.pluginName || pm.pluginId;
                                                            if (!byPlugin.has(key)) byPlugin.set(key, []);
                                                            byPlugin.get(key)!.push(pm);
                                                        }
                                                        return Array.from(byPlugin.entries()).map(([pluginName, macros]) => (
                                                            <optgroup key={pluginName} label={pluginName}>
                                                                {macros.map(pm => (
                                                                    <option key={pm.id} value={pm.id}>{pm.label}</option>
                                                                ))}
                                                            </optgroup>
                                                        ));
                                                    })()}
                                                </Form.Select>
                                            </Form.Group>
                                            {holdCfg.macro === 'command' && (
                                                <Form.Group className="mb-2">
                                                    <Form.Label className="small mb-1">Komenda (hold)</Form.Label>
                                                    <Form.Control
                                                        as="textarea"
                                                        size="sm"
                                                        value={holdCfg.command || ''}
                                                        onChange={e => updateHold('command', e.target.value)}
                                                        autoCorrect="off"
                                                        autoComplete="off"
                                                        autoCapitalize="off"
                                                        spellCheck={false}
                                                    />
                                                </Form.Group>
                                            )}
                                            {holdCfg.macro === 'kierunek' && (
                                                <Form.Group className="mb-2">
                                                    <Form.Label className="small mb-1">Kierunek (hold)</Form.Label>
                                                    <Form.Select
                                                        size="sm"
                                                        value={holdCfg.direction || ''}
                                                        onChange={e => updateHold('direction', e.target.value)}
                                                    >
                                                        {directionOptions.map(d => (
                                                            <option key={d} value={d}>{d}</option>
                                                        ))}
                                                    </Form.Select>
                                                </Form.Group>
                                            )}
                                            {(holdCfg.macro === 'attackEnemy' || holdCfg.macro === 'blockEnemy') && (
                                                <Form.Group className="mb-2">
                                                    <Form.Label className="small mb-1">Slot wroga (hold)</Form.Label>
                                                    <Form.Select
                                                        size="sm"
                                                        value={holdCfg.enemySlot ?? 0}
                                                        onChange={e => updateHold('enemySlot', parseInt(e.target.value))}
                                                    >
                                                        <option value={0}>Slot 1</option>
                                                        <option value={1}>Slot 2</option>
                                                        <option value={2}>Slot 3</option>
                                                    </Form.Select>
                                                </Form.Group>
                                            )}
                                            {holdCfg.macro === 'compound' && (
                                                <div className="mb-2">
                                                    <Form.Label className="small fw-bold mb-1">Kroki (hold)</Form.Label>
                                                    {(holdCfg.steps || []).map((step, index) => (
                                                        <div key={index} className="mb-2 p-2 border rounded">
                                                            <div className="d-flex justify-content-between align-items-center mb-1">
                                                                <span className="small fw-bold">Krok {index + 1}</span>
                                                                <div className="d-flex gap-1">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline-secondary"
                                                                        disabled={index === 0}
                                                                        onClick={() => {
                                                                            const steps = [...(holdCfg.steps || [])];
                                                                            [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
                                                                            updateHold('steps', steps);
                                                                        }}
                                                                    >^</Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline-secondary"
                                                                        disabled={index === (holdCfg.steps || []).length - 1}
                                                                        onClick={() => {
                                                                            const steps = [...(holdCfg.steps || [])];
                                                                            [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
                                                                            updateHold('steps', steps);
                                                                        }}
                                                                    >v</Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline-danger"
                                                                        onClick={() => {
                                                                            const steps = (holdCfg.steps || []).filter((_: any, i: number) => i !== index);
                                                                            updateHold('steps', steps);
                                                                        }}
                                                                    >X</Button>
                                                                </div>
                                                            </div>
                                                            <Form.Select
                                                                size="sm"
                                                                className="mb-1"
                                                                value={step.macro}
                                                                onChange={e => {
                                                                    const steps = [...(holdCfg.steps || [])];
                                                                    steps[index] = { ...steps[index], macro: e.target.value };
                                                                    updateHold('steps', steps);
                                                                }}
                                                            >
                                                                {macroOptions.filter(o => o.value !== 'empty' && o.value !== 'compound').map(o => (
                                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                                ))}
                                                                {(() => {
                                                                    const byPlugin = new Map<string, typeof pluginMacros>();
                                                                    for (const pm of pluginMacros) {
                                                                        const key = pm.pluginName || pm.pluginId;
                                                                        if (!byPlugin.has(key)) byPlugin.set(key, []);
                                                                        byPlugin.get(key)!.push(pm);
                                                                    }
                                                                    return Array.from(byPlugin.entries()).map(([pluginName, macros]) => (
                                                                        <optgroup key={pluginName} label={pluginName}>
                                                                            {macros.map(pm => (
                                                                                <option key={pm.id} value={pm.id}>{pm.label}</option>
                                                                            ))}
                                                                        </optgroup>
                                                                    ));
                                                                })()}
                                                            </Form.Select>
                                                            {step.macro === 'command' && (
                                                                <Form.Control
                                                                    as="textarea"
                                                                    size="sm"
                                                                    placeholder="Komenda"
                                                                    value={step.command || ''}
                                                                    onChange={e => {
                                                                        const steps = [...(holdCfg.steps || [])];
                                                                        steps[index] = { ...steps[index], command: e.target.value };
                                                                        updateHold('steps', steps);
                                                                    }}
                                                                    autoCorrect="off"
                                                                    autoComplete="off"
                                                                    autoCapitalize="off"
                                                                    spellCheck={false}
                                                                />
                                                            )}
                                                            {step.macro === 'kierunek' && (
                                                                <Form.Select
                                                                    size="sm"
                                                                    value={step.direction || 'n'}
                                                                    onChange={e => {
                                                                        const steps = [...(holdCfg.steps || [])];
                                                                        steps[index] = { ...steps[index], direction: e.target.value };
                                                                        updateHold('steps', steps);
                                                                    }}
                                                                >
                                                                    {directionOptions.map(d => (
                                                                        <option key={d} value={d}>{d}</option>
                                                                    ))}
                                                                </Form.Select>
                                                            )}
                                                            {(step.macro === 'attackEnemy' || step.macro === 'blockEnemy') && (
                                                                <Form.Select
                                                                    size="sm"
                                                                    value={step.enemySlot ?? 0}
                                                                    onChange={e => {
                                                                        const steps = [...(holdCfg.steps || [])];
                                                                        steps[index] = { ...steps[index], enemySlot: parseInt(e.target.value) };
                                                                        updateHold('steps', steps);
                                                                    }}
                                                                >
                                                                    <option value={0}>Slot 1</option>
                                                                    <option value={1}>Slot 2</option>
                                                                    <option value={2}>Slot 3</option>
                                                                </Form.Select>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <Button
                                                        size="sm"
                                                        variant="outline-primary"
                                                        className="w-100"
                                                        onClick={() => {
                                                            const steps = [...(holdCfg.steps || []), { macro: 'command' as MacroType, command: '' }];
                                                            updateHold('steps', steps);
                                                        }}
                                                    >+ Dodaj krok</Button>
                                                </div>
                                            )}
                                            {/* Hold plugin macro config fields */}
                                            {holdCfg.macro?.startsWith('plugin:') && (() => {
                                                const pluginMacro = pluginMacros.find(pm => pm.id === holdCfg.macro);
                                                if (!pluginMacro?.configFields?.length) return null;
                                                const pluginConfig = holdCfg.pluginConfig || {};
                                                return pluginMacro.configFields.map(field => (
                                                    <Form.Group key={`hold-${field.name}`} className="mb-2">
                                                        <Form.Label className="small mb-1">{field.label} (hold)</Form.Label>
                                                        {field.type === 'text' && (
                                                            <Form.Control
                                                                size="sm"
                                                                type="text"
                                                                value={pluginConfig[field.name] ?? field.defaultValue ?? ''}
                                                                onChange={e => updateHold('pluginConfig', { ...pluginConfig, [field.name]: e.target.value })}
                                                            />
                                                        )}
                                                        {field.type === 'textarea' && (
                                                            <Form.Control
                                                                as="textarea"
                                                                size="sm"
                                                                rows={2}
                                                                value={pluginConfig[field.name] ?? field.defaultValue ?? ''}
                                                                onChange={e => updateHold('pluginConfig', { ...pluginConfig, [field.name]: e.target.value })}
                                                            />
                                                        )}
                                                        {field.type === 'number' && (
                                                            <Form.Control
                                                                size="sm"
                                                                type="number"
                                                                value={pluginConfig[field.name] ?? field.defaultValue ?? 0}
                                                                onChange={e => updateHold('pluginConfig', { ...pluginConfig, [field.name]: Number(e.target.value) })}
                                                            />
                                                        )}
                                                        {field.type === 'select' && field.options && (
                                                            <Form.Select
                                                                size="sm"
                                                                value={pluginConfig[field.name] ?? field.defaultValue ?? ''}
                                                                onChange={e => updateHold('pluginConfig', { ...pluginConfig, [field.name]: e.target.value })}
                                                            >
                                                                {field.options.map(opt => (
                                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                ))}
                                                            </Form.Select>
                                                        )}
                                                        {field.type === 'checkbox' && (
                                                            <Form.Check
                                                                id={`hold-plugin-config-mobile-${active!.id}-${field.name}`}
                                                                type="checkbox"
                                                                checked={pluginConfig[field.name] ?? field.defaultValue ?? false}
                                                                onChange={e => updateHold('pluginConfig', { ...pluginConfig, [field.name]: e.target.checked })}
                                                            />
                                                        )}
                                                    </Form.Group>
                                                ));
                                            })()}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
            <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                <Button size="sm" variant="outline-secondary" onClick={() => restoreDefaults(view)}>
                    Domyslne
                </Button>
                <Form.Select
                    size="sm"
                    value={copyFrom}
                    onChange={e => setCopyFrom(e.target.value as Mode)}
                    style={{ width: 'auto', minWidth: '120px' }}
                >
                    <option value="solo">Bez druzyny</option>
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
