import { useEffect, useState, useRef, RefObject } from "react";
import { Button, Form } from "react-bootstrap";
import {
    loadSettings,
    saveSettings,
    applySettings,
    defaultSettings,
    ButtonSetting,
    MacroType,
    Settings,
    defaultOrder,
    defaultCols,
    createDefaultLayout,
    defaultBackground,
} from "../mobileButtonSettings";

import ButtonGrid, { Mode } from "./ButtonGrid";

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
    { value: "empty", label: "Puste" },
];

const directionOptions = ["nw","n","ne","w","e","sw","s","se","u","d"] as const;

const emptySetting: ButtonSetting = { macro: 'empty', label: '', color: 'transparent' };

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
    });
    const [syncDirs, setSyncDirs] = useState(true);
    const [active, setActive] = useState<{ set: Mode; id: string } | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
    const [view, setView] = useState<Mode>('solo');
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
        loadSettings().then(setSettings);
    }, []);
    const notEditable = ['buttons-toggle'];

    function nextId(ids: string[]) {
        const max = ids.reduce((m, id) => {
            const match = /^button-(\d+)$/.exec(id);
            return match ? Math.max(m, parseInt(match[1], 10)) : m;
        }, 3);
        let current = max;
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
        const parent = refs[setName].current?.getBoundingClientRect();
        if (parent) {
            setPos({ left: rect.left - parent.left, top: rect.bottom - parent.top + 4 });
        }
        setActive({ set: setName, id });
        const cfg = settings[setName].buttons[id] || defaultSettings[id] || emptySetting;
        if (cfg.macro === 'kierunek') {
            setSyncDirs(true);
        }
        ev.stopPropagation();
    }

    function changeView(v: Mode) {
        setView(v);
        setActive(null);
    }

    function close() {
        setActive(null);
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

    function updateAllDirections(field: 'color' | 'activeColor', value: string) {
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
        const teamActive = !!(window as any).clientExtension?.TeamManager?.isInAnyTeam?.();
        const leaderActive = !!(window as any).clientExtension?.TeamManager?.isLeader?.();
        applySettings(settings, teamActive, leaderActive);
        window.dispatchEvent(new Event('close-options'));
    }

    const activeCfg = active ? (settings[active.set].buttons[active.id] || defaultSettings[active.id] || emptySetting) : null;
    const currentBackground = settings[view].background || defaultBackground;
    const { hex: backgroundHex, alpha: backgroundAlpha } = parseBackgroundColor(currentBackground);

    return (
        <div onClick={close} className="w-100 position-relative">
            <div className="d-flex flex-column flex-lg-row align-items-stretch align-items-lg-center gap-2 mb-2 w-100">
                <div className="mobile-buttons-mode-toggle">
                    <Button
                        size="sm"
                        variant={view === 'solo' ? 'primary' : 'secondary'}
                        className="text-nowrap"
                        onClick={() => changeView('solo')}
                    >
                        Bez drużyny
                    </Button>
                    <Button
                        size="sm"
                        variant={view === 'team' ? 'primary' : 'secondary'}
                        className="text-nowrap"
                        onClick={() => changeView('team')}
                    >
                        W drużynie
                    </Button>
                    <Button
                        size="sm"
                        variant={view === 'leader' ? 'primary' : 'secondary'}
                        className="text-nowrap"
                        onClick={() => changeView('leader')}
                    >
                        Prowadzący
                    </Button>
                </div>
                <Button
                    size="sm"
                    variant="secondary"
                    className="w-100 w-lg-auto"
                    onClick={() => restoreDefaults(view)}
                >
                    Domyślne
                </Button>
                <Form.Check
                    id="mobile-buttons-lock"
                    type="checkbox"
                    className="user-select-none ms-lg-auto text-nowrap"
                    label="Zablokuj przyciski"
                    checked={settings.locked}
                    onChange={e => setSettings(prev => ({ ...prev, locked: e.target.checked }))}
                />
            </div>
            <div className="d-flex flex-column align-items-center mb-2 w-100">
                <div className="d-flex gap-1 mb-2">
                    <Button size="sm" variant="secondary" onClick={() => addRow('top')}>+R↑</Button>
                    <Button size="sm" variant="secondary" onClick={() => removeRow('top')}>-R↑</Button>
                </div>
                <div className="d-flex flex-column flex-lg-row align-items-center gap-2">
                    <div className="d-flex flex-column gap-1 me-lg-2">
                        <Button size="sm" variant="secondary" onClick={() => addCol('left')}>+C←</Button>
                        <Button size="sm" variant="secondary" onClick={() => removeCol('left')}>-C←</Button>
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
                            />
                        ))}
                    </div>
                    <div className="d-flex flex-column gap-1 ms-lg-2">
                        <Button size="sm" variant="secondary" onClick={() => addCol('right')}>+C→</Button>
                        <Button size="sm" variant="secondary" onClick={() => removeCol('right')}>-C→</Button>
                    </div>
                </div>
                <div className="d-flex gap-1 mt-2">
                    <Button size="sm" variant="secondary" onClick={() => addRow('bottom')}>+R↓</Button>
                    <Button size="sm" variant="secondary" onClick={() => removeRow('bottom')}>-R↓</Button>
                </div>
            </div>
            <Form.Group
                className="form-label mb-3"
                onClick={ev => ev.stopPropagation()}
                onMouseDown={ev => ev.stopPropagation()}
                onTouchStart={ev => ev.stopPropagation()}
            >
                <Form.Label>Tło przycisków</Form.Label>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Form.Control
                        size="sm"
                        type="color"
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
                    <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: 0 }}>
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
                        <span className="small text-nowrap">{Math.round(backgroundAlpha * 100)}%</span>
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
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
            </Form.Group>
            {active && activeCfg && (
                <div
                    className="mobile-button-config"
                    style={{ left: pos.left, top: pos.top }}
                    onClick={ev => ev.stopPropagation()}
                >
                    <button
                        type="button"
                        className="btn-close position-absolute end-0"
                        onClick={close}
                    />
                    <Form.Group className="form-label mb-2">
                        <Form.Label>Makro</Form.Label>
                        <Form.Select
                            size="sm"
                            className="mobile-button-macro"
                            value={activeCfg.macro}
                            onChange={e => {
                                const val = e.target.value as MacroType;
                                if (val === 'empty') {
                                    makeBlank(active!.set, active!.id);
                                } else {
                                    update(active!.set, active!.id, 'macro', val);
                                }
                            }}
                        >
                            {macroOptions.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                    {activeCfg.macro !== 'empty' && (
                        <Form.Group className="form-label mb-2">
                            <Form.Label>Etykieta</Form.Label>
                            <Form.Control
                                size="sm"
                                className="mobile-button-label"
                                type="text"
                                value={activeCfg.label}
                                onChange={e => update(active!.set, active!.id, 'label', e.target.value)}
                            />
                        </Form.Group>
                    )}
                    {activeCfg.macro !== 'empty' && (
                        <Form.Group className="form-label mb-2 d-flex align-items-center gap-1">
                            <Form.Label>Kolor</Form.Label>
                            <Form.Control
                                size="sm"
                                type="color"
                                className="mobile-button-color flex-grow-1"
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
                            <Button size="sm" variant="secondary" onClick={() => resetColor(active!.set, active!.id)}>↺</Button>
                        </Form.Group>
                    )}
                    {activeCfg.macro === 'kierunek' && (
                        <Form.Group className="form-label mb-2 d-flex align-items-center gap-1">
                            <Form.Label>Kolor aktywny</Form.Label>
                            <Form.Control
                                size="sm"
                                type="color"
                                className="mobile-button-color flex-grow-1"
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
                            <Button size="sm" variant="secondary" onClick={() => resetActiveColor(active!.set, active!.id)}>↺</Button>
                        </Form.Group>
                    )}
                    {activeCfg.macro === "kierunek" && (
                        <>
                            <Form.Group className="form-label mb-2">
                                <Form.Check
                                    type="checkbox"
                                    label="Synchronizuj kolory"
                                    checked={syncDirs}
                                    onChange={e => setSyncDirs(e.target.checked)}
                                />
                            </Form.Group>
                            <Form.Group className="form-label mb-2">
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
                            </Form.Group>
                        </>
                    )}
                    {activeCfg.macro === "command" && (
                        <Form.Group className="form-label mb-2">
                            <Form.Label>Komenda</Form.Label>
                            <Form.Control
                                as="textarea"
                                size="sm"
                                className="mobile-button-command"
                                value={activeCfg.command || ""}
                                onChange={e => update(active!.set, active!.id, "command", e.target.value)}
                            />
                        </Form.Group>
                    )}
                </div>
            )}
            <div className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 mt-2">
                <div className="d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center gap-2 flex-grow-1">
                    <Form.Select
                        size="sm"
                        value={copyFrom}
                        onChange={e => setCopyFrom(e.target.value as Mode)}
                        className="flex-grow-1"
                        style={{ minWidth: 0 }}
                    >
                        <option value="solo">Bez drużyny</option>
                        <option value="team">W drużynie</option>
                        <option value="leader">Prowadzący</option>
                    </Form.Select>
                    <Button size="sm" variant="secondary" className="w-100 w-sm-auto" onClick={() => copyLayout(copyFrom)}>
                        Kopiuj
                    </Button>
                </div>
                <Button id="mobile-buttons-save" className="w-100 w-md-auto text-nowrap" onClick={save}>Zapisz</Button>
            </div>
        </div>
    );
}

export default MobileButtons;
