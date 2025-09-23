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

type SettingsMap = Record<string, ButtonSetting>;

const modes: Mode[] = ['solo', 'team', 'leader'];

function MobileButtons() {
    const [settings, setSettings] = useState<Settings>({
        solo: { buttons: {}, order: [...defaultOrder], cols: defaultCols },
        team: { buttons: {}, order: [...defaultOrder], cols: defaultCols },
        leader: { buttons: {}, order: [...defaultOrder], cols: defaultCols },
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
        const modal = (window as any).bootstrap?.Modal.getInstance(document.getElementById('mobile-buttons-modal')!);
        modal?.hide();
    }

    const activeCfg = active ? (settings[active.set].buttons[active.id] || defaultSettings[active.id] || emptySetting) : null;

    return (
        <div onClick={close} className="w-100 position-relative">
            <div className="d-flex align-items-center gap-2 mb-2">
                <div className="btn-group">
                    <Button
                        size="sm"
                        variant={view === 'solo' ? 'primary' : 'secondary'}
                        onClick={() => changeView('solo')}
                    >
                        Bez drużyny
                    </Button>
                    <Button
                        size="sm"
                        variant={view === 'team' ? 'primary' : 'secondary'}
                        onClick={() => changeView('team')}
                    >
                        W drużynie
                    </Button>
                    <Button
                        size="sm"
                        variant={view === 'leader' ? 'primary' : 'secondary'}
                        onClick={() => changeView('leader')}
                    >
                        Prowadzący
                    </Button>
                </div>
                <Button size="sm" variant="secondary" onClick={() => restoreDefaults(view)}>
                    Domyślne
                </Button>
                <Form.Check
                    id="mobile-buttons-lock"
                    type="checkbox"
                    className="ms-auto user-select-none"
                    label="Zablokuj przyciski"
                    checked={settings.locked}
                    onChange={e => setSettings(prev => ({ ...prev, locked: e.target.checked }))}
                />
            </div>
            <div className="d-flex flex-column align-items-center mb-2">
                <div className="d-flex gap-1 mb-2">
                    <Button size="sm" variant="secondary" onClick={() => addRow('top')}>+R↑</Button>
                    <Button size="sm" variant="secondary" onClick={() => removeRow('top')}>-R↑</Button>
                </div>
                <div className="d-flex align-items-center">
                    <div className="d-flex flex-column gap-1 me-2">
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
                    <div className="d-flex flex-column gap-1 ms-2">
                        <Button size="sm" variant="secondary" onClick={() => addCol('right')}>+C→</Button>
                        <Button size="sm" variant="secondary" onClick={() => removeCol('right')}>-C→</Button>
                    </div>
                </div>
                <div className="d-flex gap-1 mt-2">
                    <Button size="sm" variant="secondary" onClick={() => addRow('bottom')}>+R↓</Button>
                    <Button size="sm" variant="secondary" onClick={() => removeRow('bottom')}>-R↓</Button>
                </div>
            </div>
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
            <div className="d-flex justify-content-between mt-2">
                <div className="d-flex align-items-center gap-2">
                    <Form.Select size="sm" value={copyFrom} onChange={e => setCopyFrom(e.target.value as Mode)}>
                        <option value="solo">Bez drużyny</option>
                        <option value="team">W drużynie</option>
                        <option value="leader">Prowadzący</option>
                    </Form.Select>
                    <Button size="sm" variant="secondary" onClick={() => copyLayout(copyFrom)}>
                        Kopiuj
                    </Button>
                </div>
                <Button id="mobile-buttons-save" onClick={save}>Zapisz</Button>
            </div>
        </div>
    );
}

export default MobileButtons;
