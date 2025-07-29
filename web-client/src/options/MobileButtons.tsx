import { useEffect, useState, useRef } from "react";
import { Button, Form } from "react-bootstrap";
import {
    loadSettings,
    saveSettings,
    applySettings,
    defaultSettings,
    ButtonSetting,
    MacroType,
} from "../mobileButtonSettings";

const macroOptions: { value: MacroType; label: string }[] = [
    { value: "functional", label: "Send functional" },
    { value: "zList", label: "Create /z dropdown list" },
    { value: "zaList", label: "Create /za dropdown list" },
    { value: "command", label: "Send command" },
    { value: "kierunek", label: "Direction button" },
    { value: "specialExit", label: "Use special exit" },
];

const directionOptions = ["nw","n","ne","w","e","sw","s","se","u","d"] as const;

type SettingsMap = Record<string, ButtonSetting>;

function MobileButtons() {
    const [settings, setSettings] = useState<SettingsMap>({});
    const [active, setActive] = useState<string | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
    const previewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadSettings().then(setSettings);
    }, []);

    const notEditable = ['buttons-toggle'];
    const order = [
        'z-list-toggle',
        'zas-list-toggle',
        'go-button',
        'buttons-toggle',
        'bracket-right-button',
        'button-1',
        'button-2',
        'button-3',
        'nw-button',
        'n-button',
        'ne-button',
        'u-button',
        'w-button',
        'c-button',
        'e-button',
        'd-button',
        'sw-button',
        's-button',
        'se-button',
        'special-exit-button',
    ];

    const topButtons = [
        'z-list-toggle',
        'zas-list-toggle',
        'go-button',
        'buttons-toggle',
        'bracket-right-button',
        'button-1',
        'button-2',
        'button-3',
    ];

    const textDirButtons = ['u-button', 'c-button', 'd-button', 'special-exit-button'];

    function openConfig(id: string, ev: React.MouseEvent<HTMLButtonElement>) {
        const rect = ev.currentTarget.getBoundingClientRect();
        const parent = previewRef.current?.getBoundingClientRect();
        if (parent) {
            setPos({ left: rect.left - parent.left, top: rect.bottom - parent.top + 4 });
        }
        setActive(id);
        ev.stopPropagation();
    }

    function close() {
        setActive(null);
    }

    function update(id: string, field: keyof ButtonSetting, value: any) {
        setSettings(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    }

    function resetColor(id: string) {
        update(id, "color", defaultSettings[id].color);
    }

    function save() {
        saveSettings(settings);
        applySettings(settings);
        const modal = (window as any).bootstrap?.Modal.getInstance(document.getElementById('mobile-buttons-modal')!);
        modal?.hide();
    }

    const activeCfg = active ? (settings[active] || defaultSettings[active]) : null;

    return (
        <div onClick={close} className="w-100 position-relative">
            <div
                ref={previewRef}
                id="mobile-buttons-preview"
                className="mobile-direction-buttons mb-2"
            >
                {order.map(id => {
                    const cfg = settings[id] || defaultSettings[id] || { label: '⇩', color: '#87CEEB', macro: 'functional' };
                    let classes = 'mobile-button';
                    if (topButtons.includes(id)) {
                        classes += ' mobile-button-text top-button';
                    } else if (textDirButtons.includes(id)) {
                        classes += ' mobile-button-text direction-button';
                    } else {
                        classes += ' direction-button';
                    }
                    const handle = notEditable.includes(id) ? undefined : (ev: React.MouseEvent<HTMLButtonElement>) => openConfig(id, ev);
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
                            onChange={e => update(active, "macro", e.target.value as MacroType)}
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
                            onChange={e => update(active!, "label", e.target.value)}
                        />
                    </Form.Group>
                    <Form.Group className="form-label mb-2 d-flex align-items-center gap-1">
                        <Form.Label>Kolor</Form.Label>
                        <Form.Control
                            size="sm"
                            type="color"
                            className="mobile-button-color flex-grow-1"
                            value={activeCfg.color}
                            onChange={e => update(active!, "color", e.target.value)}
                        />
                        <Button size="sm" variant="secondary" onClick={() => resetColor(active!)}>↺</Button>
                    </Form.Group>
                    {activeCfg.macro === "kierunek" && (
                        <Form.Group className="form-label mb-2">
                            <Form.Label>Kierunek</Form.Label>
                            <Form.Select
                                size="sm"
                                className="mobile-button-direction"
                                value={activeCfg.direction || ""}
                                onChange={e => update(active!, "direction", e.target.value)}
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
                                onChange={e => update(active!, "command", e.target.value)}
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
