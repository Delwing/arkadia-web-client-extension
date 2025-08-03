import { useEffect, useState, useRef } from "react";
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
} from "../mobileButtonSettings";

const macroOptions: { value: MacroType; label: string }[] = [
    { value: "functional", label: "Bind funkcyjny" },
    { value: "zList", label: "Lista /z" },
    { value: "zaList", label: "Lista /za" },
    { value: "idzList", label: "Lista idz" },
    { value: "command", label: "Wyślij komendę" },
    { value: "kierunek", label: "Kierunek" },
    { value: "specialExit", label: "Wyjście specjalne" },
    { value: "wesprzyj", label: "Wesprzyj prowadzącego" },
    { value: "moveMode", label: "Tryb ruchu" },
];

const directionOptions = ["nw","n","ne","w","e","sw","s","se","u","d"] as const;

const emptySetting: ButtonSetting = { macro: 'command', label: '', color: 'transparent' };

type SettingsMap = Record<string, ButtonSetting>;

function MobileButtons() {
    const [settings, setSettings] = useState<Settings>({ solo: {}, team: {}, order: [...defaultOrder], cols: defaultCols });
    const [active, setActive] = useState<{ set: 'solo' | 'team'; id: string } | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
    const [view, setView] = useState<'solo' | 'team'>('solo');
    const soloRef = useRef<HTMLDivElement>(null);
    const teamRef = useRef<HTMLDivElement>(null);

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
            const makeId = nextId(prev.order);
            const ids = Array.from({ length: prev.cols }, () => makeId());
            const solo: SettingsMap = { ...prev.solo };
            const team: SettingsMap = { ...prev.team };
            ids.forEach(id => {
                solo[id] = { ...emptySetting };
                team[id] = { ...emptySetting };
            });
            const order = pos === 'top' ? [...ids, ...prev.order] : [...prev.order, ...ids];
            return { ...prev, solo, team, order };
        });
    }

    function removeRow(pos: 'top' | 'bottom') {
        setSettings(prev => {
            const rows = Math.floor(prev.order.length / prev.cols);
            if (rows <= 1) return prev;
            const start = pos === 'top' ? 0 : prev.order.length - prev.cols;
            const removed = prev.order.slice(start, start + prev.cols);
            const order = pos === 'top' ? prev.order.slice(prev.cols) : prev.order.slice(0, start);
            const solo: SettingsMap = { ...prev.solo };
            const team: SettingsMap = { ...prev.team };
            removed.forEach(id => { delete solo[id]; delete team[id]; });
            return { ...prev, solo, team, order };
        });
    }

    function addCol(side: 'left' | 'right') {
        setSettings(prev => {
            const makeId = nextId(prev.order);
            const solo: SettingsMap = { ...prev.solo };
            const team: SettingsMap = { ...prev.team };
            const order: string[] = [];
            const rows = Math.floor(prev.order.length / prev.cols);
            for (let r = 0; r < rows; r++) {
                if (side === 'left') {
                    const id = makeId();
                    order.push(id);
                    solo[id] = { ...emptySetting };
                    team[id] = { ...emptySetting };
                }
                const row = prev.order.slice(r * prev.cols, (r + 1) * prev.cols);
                order.push(...row);
                if (side === 'right') {
                    const id = makeId();
                    order.push(id);
                    solo[id] = { ...emptySetting };
                    team[id] = { ...emptySetting };
                }
            }
            return { ...prev, solo, team, order, cols: prev.cols + 1 };
        });
    }

    function removeCol(side: 'left' | 'right') {
        setSettings(prev => {
            if (prev.cols <= 1) return prev;
            const rows = Math.floor(prev.order.length / prev.cols);
            const order: string[] = [];
            const removed: string[] = [];
            for (let r = 0; r < rows; r++) {
                const row = prev.order.slice(r * prev.cols, (r + 1) * prev.cols);
                if (side === 'left') {
                    removed.push(row[0]);
                    order.push(...row.slice(1));
                } else {
                    removed.push(row[row.length - 1]);
                    order.push(...row.slice(0, row.length - 1));
                }
            }
            const solo: SettingsMap = { ...prev.solo };
            const team: SettingsMap = { ...prev.team };
            removed.forEach(id => { delete solo[id]; delete team[id]; });
            return { ...prev, solo, team, order, cols: prev.cols - 1 };
        });
    }

    function openConfig(setName: 'solo' | 'team', id: string, ev: React.MouseEvent<HTMLButtonElement>) {
        const rect = ev.currentTarget.getBoundingClientRect();
        const parent = (setName === 'solo' ? soloRef.current : teamRef.current)?.getBoundingClientRect();
        if (parent) {
            setPos({ left: rect.left - parent.left, top: rect.bottom - parent.top + 4 });
        }
        setActive({ set: setName, id });
        ev.stopPropagation();
    }

    function changeView(v: 'solo' | 'team') {
        setView(v);
        setActive(null);
    }

    function close() {
        setActive(null);
    }

    function update(setName: 'solo' | 'team', id: string, field: keyof ButtonSetting, value: any) {
        setSettings(prev => ({ ...prev, [setName]: { ...prev[setName], [id]: { ...prev[setName][id], [field]: value } } }));
    }

    function resetColor(setName: 'solo' | 'team', id: string) {
        const def = defaultSettings[id]?.color || emptySetting.color;
        update(setName, "color", def);
    }

    function save() {
        saveSettings(settings);
        const teamActive = !!(window as any).clientExtension?.TeamManager?.getLeader?.();
        applySettings(settings, teamActive);
        const modal = (window as any).bootstrap?.Modal.getInstance(document.getElementById('mobile-buttons-modal')!);
        modal?.hide();
    }

    const activeCfg = active ? (settings[active.set][active.id] || defaultSettings[active.id] || emptySetting) : null;

    return (
        <div onClick={close} className="w-100 position-relative">
            <div className="btn-group mb-2">
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
            </div>
            <div className="d-flex justify-content-between mb-2 flex-wrap gap-2">
                <div className="btn-group">
                    <Button size="sm" variant="secondary" onClick={() => addRow('top')}>+R↑</Button>
                    <Button size="sm" variant="secondary" onClick={() => removeRow('top')}>-R↑</Button>
                    <Button size="sm" variant="secondary" onClick={() => addRow('bottom')}>+R↓</Button>
                    <Button size="sm" variant="secondary" onClick={() => removeRow('bottom')}>-R↓</Button>
                </div>
                <div className="btn-group">
                    <Button size="sm" variant="secondary" onClick={() => addCol('left')}>+C←</Button>
                    <Button size="sm" variant="secondary" onClick={() => removeCol('left')}>-C←</Button>
                    <Button size="sm" variant="secondary" onClick={() => addCol('right')}>+C→</Button>
                    <Button size="sm" variant="secondary" onClick={() => removeCol('right')}>-C→</Button>
                </div>
            </div>
            <div
                ref={soloRef}
                id="mobile-buttons-preview-solo"
                className={`mobile-direction-buttons mb-2 ${view === 'solo' ? '' : 'd-none'}`}
                style={{ gridTemplateColumns: `repeat(${settings.cols}, auto)` }}
            >
                {settings.order.map(id => {
                    const cfg = settings.solo[id] || defaultSettings[id] || emptySetting;
                    let classes = 'mobile-button';
                    if (cfg.macro === 'kierunek') {
                        classes += ' direction-button';
                    } else {
                        classes += ' mobile-button-text';
                    }
                    if (!cfg.label) classes += ' empty';
                    const handle = notEditable.includes(id) ? undefined : (ev: React.MouseEvent<HTMLButtonElement>) => openConfig('solo', id, ev);
                    return (
                        <button
                            key={id}
                            data-button-id={id}
                            className={classes}
                            style={{ backgroundColor: cfg.color }}
                            onClick={handle}
                        >
                            {cfg.label}
                        </button>
                    );
                })}
            </div>
            <div
                ref={teamRef}
                id="mobile-buttons-preview-team"
                className={`mobile-direction-buttons mb-2 ${view === 'team' ? '' : 'd-none'}`}
                style={{ gridTemplateColumns: `repeat(${settings.cols}, auto)` }}
            >
                {settings.order.map(id => {
                    const cfg = settings.team[id] || defaultSettings[id] || emptySetting;
                    let classes = 'mobile-button';
                    if (cfg.macro === 'kierunek') {
                        classes += ' direction-button';
                    } else {
                        classes += ' mobile-button-text';
                    }
                    if (!cfg.label) classes += ' empty';
                    const handle = notEditable.includes(id) ? undefined : (ev: React.MouseEvent<HTMLButtonElement>) => openConfig('team', id, ev);
                    return (
                        <button
                            key={id}
                            data-button-id={id}
                            className={classes}
                            style={{ backgroundColor: cfg.color }}
                            onClick={handle}
                        >
                            {cfg.label}
                        </button>
                    );
                })}
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
                            onChange={e => update(active!.set, active!.id, "macro", e.target.value as MacroType)}
                        >
                            {macroOptions.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                    <Form.Group className="form-label mb-2">
                        <Form.Label>Etykieta</Form.Label>
                        <Form.Control
                            size="sm"
                            className="mobile-button-label"
                            type="text"
                            value={activeCfg.label}
                            onChange={e => update(active!.set, active!.id, "label", e.target.value)}
                        />
                    </Form.Group>
                    <Form.Group className="form-label mb-2 d-flex align-items-center gap-1">
                        <Form.Label>Kolor</Form.Label>
                        <Form.Control
                            size="sm"
                            type="color"
                            className="mobile-button-color flex-grow-1"
                            value={activeCfg.color}
                            onChange={e => update(active!.set, active!.id, "color", e.target.value)}
                        />
                        <Button size="sm" variant="secondary" onClick={() => resetColor(active!.set, active!.id)}>↺</Button>
                    </Form.Group>
                    {activeCfg.macro === "kierunek" && (
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
            <div className="d-flex justify-content-end mt-2">
                <Button id="mobile-buttons-save" onClick={save}>Zapisz</Button>
            </div>
        </div>
    );
}

export default MobileButtons;
