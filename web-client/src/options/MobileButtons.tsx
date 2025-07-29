import { useEffect, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { ButtonSetting, MacroType, loadSettings, saveSettings, applySettings, defaultSettings } from '../mobileButtonSettings';

const macroOptions: { value: MacroType; label: string }[] = [
    { value: 'functional', label: 'Send functional' },
    { value: 'zList', label: 'Create /z dropdown list' },
    { value: 'zaList', label: 'Create /za dropdown list' },
    { value: 'command', label: 'Send command' },
    { value: 'kierunek', label: 'Direction button' },
    { value: 'specialExit', label: 'Use special exit' },
];

const directions = ['nw','n','ne','w','e','sw','s','se','u','d'];

export default function MobileButtons() {
    const [settings, setSettings] = useState<Record<string, ButtonSetting>>({...defaultSettings});

    useEffect(() => {
        loadSettings().then(setSettings);
    }, []);

    const handleChange = (id: string, field: keyof ButtonSetting, value: any) => {
        setSettings(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    };

    const save = () => {
        saveSettings(settings);
        applySettings(settings);
        window.dispatchEvent(new Event('close-options'));
    };

    return (
        <div className="d-flex flex-column gap-3">
            {Object.keys(defaultSettings).map(id => {
                const cfg = settings[id];
                if (!cfg) return null;
                return (
                    <div key={id} className="border rounded p-2">
                        <div className="mb-2">
                            <button className="mobile-button" style={{ backgroundColor: cfg.color }}>
                                {cfg.label}
                            </button>
                        </div>
                        <Form.Group className="mb-2">
                            <Form.Label>Makro</Form.Label>
                            <Form.Select
                                size="sm"
                                value={cfg.macro}
                                onChange={e => handleChange(id, 'macro', e.target.value as MacroType)}
                            >
                                {macroOptions.map(o => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-2">
                            <Form.Label>Etykieta</Form.Label>
                            <Form.Control
                                size="sm"
                                value={cfg.label}
                                onChange={e => handleChange(id, 'label', e.target.value)}
                            />
                        </Form.Group>
                        <Form.Group className="mb-2">
                            <Form.Label>Kolor</Form.Label>
                            <Form.Control
                                type="color"
                                size="sm"
                                value={cfg.color}
                                onChange={e => handleChange(id, 'color', e.target.value)}
                            />
                        </Form.Group>
                        {cfg.macro === 'kierunek' && (
                            <Form.Group className="mb-2">
                                <Form.Label>Kierunek</Form.Label>
                                <Form.Select
                                    size="sm"
                                    value={cfg.direction || ''}
                                    onChange={e => handleChange(id, 'direction', e.target.value)}
                                >
                                    <option value=""></option>
                                    {directions.map(d => (
                                        <option key={d} value={d}>
                                            {d}
                                        </option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        )}
                        {cfg.macro === 'command' && (
                            <Form.Group className="mb-2">
                                <Form.Label>Komenda</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={1}
                                    size="sm"
                                    value={cfg.command || ''}
                                    onChange={e => handleChange(id, 'command', e.target.value)}
                                />
                            </Form.Group>
                        )}
                    </div>
                );
            })}
            <Button onClick={save} className="align-self-end">
                Zapisz
            </Button>
        </div>
    );
}
