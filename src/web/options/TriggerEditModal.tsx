import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Button, Form } from 'react-bootstrap';
import { Trash2 } from 'lucide-react';
import { CustomSound } from '@modules/core/customSounds';
import {
    isTriggerMacroAvailable,
    type PluginTriggerMacro,
} from '@modules/core/pluginTriggerMacroRegistry';
import type { UserTrigger, UserMacro, TriggerType, DimEasing, SupportedEvent } from './UserTriggers';
import { SUPPORTED_EVENTS, GMCP_MSG_TYPES } from './UserTriggers';

const EVENT_COMPATIBLE_MACROS: Set<string> = new Set(['beep', 'mute', 'unmute', 'command', 'functionalBind']);

const AVAILABLE_FLAGS = [
    { flag: 'i', label: 'Ignoruj wielkosc liter' },
    { flag: 'g', label: 'Globalnie (wszystkie wystapienia)' },
    { flag: 'm', label: 'Wieloliniowy' },
];

function FlagsPicker({ value, onChange }: { value: string; onChange: (flags: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const toggle = (flag: string) => {
        const next = value.includes(flag)
            ? value.replace(flag, '')
            : value + flag;
        onChange(next);
    };

    const display = value ? `/${value}` : 'Flagi';

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                className={`btn btn-sm ${value ? 'btn-outline-light' : 'btn-outline-secondary'} font-monospace`}
                style={{ minWidth: '4.5rem' }}
                onClick={() => setOpen(!open)}
            >
                {display}
            </button>
            {open && (
                <div
                    className="border rounded shadow-sm p-2"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        zIndex: 10,
                        backgroundColor: 'var(--popup-control-bg)',
                        minWidth: '14rem',
                    }}
                >
                    {AVAILABLE_FLAGS.map(({ flag, label }) => (
                        <Form.Check
                            key={flag}
                            type="checkbox"
                            id={`flag-${flag}`}
                            label={<><code className="me-1">{flag}</code> {label}</>}
                            checked={value.includes(flag)}
                            onChange={() => toggle(flag)}
                            className="mb-1"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function normalizeMacro(macro: UserMacro): UserMacro {
    if (macro.type === 'beep' && (!macro.soundKey || typeof macro.soundKey !== 'string')) {
        return { ...macro, soundKey: 'beep' };
    }
    return macro;
}

function MacroEditor({
    macro,
    onChange,
    onRemove,
    sounds,
    onRequestSoundUpload,
    pluginMacros,
    isEventTrigger = false,
}: {
    macro: UserMacro;
    onChange: (m: UserMacro) => void;
    onRemove: () => void;
    sounds: CustomSound[];
    onRequestSoundUpload: () => Promise<string | undefined>;
    pluginMacros: PluginTriggerMacro[];
    isEventTrigger?: boolean;
}) {
    return (
        <div className="d-flex align-items-start gap-2 p-2 mb-2 border rounded" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="flex-grow-1">
                <Form.Select
                    size="sm"
                    value={macro.type}
                    className={!isTriggerMacroAvailable(macro.type) ? 'border-warning' : ''}
                    onChange={e => {
                        const nextType = e.target.value;
                        onChange({
                            ...macro,
                            type: nextType,
                            soundKey: nextType === 'beep' ? macro.soundKey || 'beep' : undefined,
                        });
                    }}
                >
                    {!isEventTrigger && <option value="uppercase">Wielkie litery</option>}
                    {!isEventTrigger && <option value="color">Koloruj</option>}
                    {!isEventTrigger && <option value="replace">Zamien</option>}
                    {!isEventTrigger && <option value="wrap">Otocz tekstem</option>}
                    <option value="beep">Dzwiek</option>
                    <option value="mute">Wycisz dzwieki</option>
                    <option value="unmute">Wlacz dzwieki</option>
                    <option value="command">Komenda</option>
                    {!isEventTrigger && <option value="slowBlink">Wolne miganie</option>}
                    {!isEventTrigger && <option value="rapidBlink">Szybkie miganie</option>}
                    {!isEventTrigger && <option value="dim">Pulsowanie</option>}
                    <option value="functionalBind">Funkcyjny bind</option>
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
                    {macro.type.startsWith('plugin:') && !isTriggerMacroAvailable(macro.type) && (
                        <option value={macro.type} disabled>
                            {macro.type} (wtyczka niedostepna)
                        </option>
                    )}
                </Form.Select>
                {!isTriggerMacroAvailable(macro.type) && (
                    <Form.Text className="text-warning d-block">
                        Ta wtyczka nie jest zaladowana. Makro nie bedzie dzialac.
                    </Form.Text>
                )}
                {macro.type === 'beep' && (
                    <Form.Select
                        className="mt-1"
                        size="sm"
                        value={macro.soundKey || 'beep'}
                        onChange={async e => {
                            const value = e.target.value;
                            if (value === '__upload__') {
                                const newKey = await onRequestSoundUpload();
                                if (newKey) {
                                    onChange({ ...macro, soundKey: newKey });
                                }
                                return;
                            }
                            onChange({ ...macro, soundKey: value });
                        }}
                    >
                        <option value="beep">Domyslny beep</option>
                        {sounds.map(sound => (
                            <option key={sound.key} value={sound.key}>{sound.name}</option>
                        ))}
                        <option value="__upload__">Dodaj dzwiek...</option>
                    </Form.Select>
                )}
                {macro.type === 'command' && (
                    <Form.Control
                        className="mt-1 font-monospace"
                        type="text"
                        size="sm"
                        placeholder="Command"
                        value={macro.command || ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, command: e.target.value })}
                        autoCorrect="off"
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                )}
                {macro.type === 'functionalBind' && (
                    <>
                        <Form.Control
                            className="mt-1 font-monospace"
                            type="text"
                            size="sm"
                            placeholder="Label (np. 'zabij cel')"
                            value={macro.label || ''}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, label: e.target.value })}
                            autoCorrect="off"
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                        <Form.Control
                            className="mt-1 font-monospace"
                            type="text"
                            size="sm"
                            placeholder="Command (np. 'zabij cel')"
                            value={macro.command || ''}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, command: e.target.value })}
                            autoCorrect="off"
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </>
                )}
                {macro.type === 'dim' && (
                    <div className="d-flex flex-wrap gap-2 mt-1">
                        <Form.Group style={{ flex: '1 1 45%', minWidth: '100px' }}>
                            <Form.Label className="mb-0 small">Jasnosc poczatkowa</Form.Label>
                            <Form.Control
                                type="number"
                                size="sm"
                                min={0}
                                max={1}
                                step={0.1}
                                value={macro.dimStartOpacity ?? 1}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, dimStartOpacity: parseFloat(e.target.value) })}
                            />
                        </Form.Group>
                        <Form.Group style={{ flex: '1 1 45%', minWidth: '100px' }}>
                            <Form.Label className="mb-0 small">Jasnosc koncowa</Form.Label>
                            <Form.Control
                                type="number"
                                size="sm"
                                min={0}
                                max={1}
                                step={0.1}
                                value={macro.dimEndOpacity ?? 0.3}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, dimEndOpacity: parseFloat(e.target.value) })}
                            />
                        </Form.Group>
                        <Form.Group style={{ flex: '1 1 45%', minWidth: '100px' }}>
                            <Form.Label className="mb-0 small">Czas (ms)</Form.Label>
                            <Form.Control
                                type="number"
                                size="sm"
                                min={100}
                                step={100}
                                value={macro.dimDuration ?? 1000}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, dimDuration: parseInt(e.target.value, 10) })}
                            />
                        </Form.Group>
                        <Form.Group style={{ flex: '1 1 45%', minWidth: '100px' }}>
                            <Form.Label className="mb-0 small">Przejscie</Form.Label>
                            <Form.Select
                                size="sm"
                                value={macro.dimEasing ?? 'ease-in-out'}
                                onChange={e => onChange({ ...macro, dimEasing: e.target.value as DimEasing })}
                            >
                                <option value="linear">Liniowe</option>
                                <option value="ease">Ease</option>
                                <option value="ease-in">Ease In</option>
                                <option value="ease-out">Ease Out</option>
                                <option value="ease-in-out">Ease In-Out</option>
                            </Form.Select>
                        </Form.Group>
                    </div>
                )}
                {macro.type === 'wrap' && (
                    <div className="d-flex flex-column gap-1 mt-1">
                        <Form.Control
                            size="sm"
                            type="text"
                            placeholder="Prefix"
                            value={macro.wrapPrefix || ''}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, wrapPrefix: e.target.value })}
                            autoCorrect="off"
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                        <Form.Control
                            size="sm"
                            type="text"
                            placeholder="Suffix"
                            value={macro.wrapSuffix || ''}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, wrapSuffix: e.target.value })}
                            autoCorrect="off"
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                        <Form.Select
                            size="sm"
                            value={macro.wrapScope || 'match'}
                            onChange={e => onChange({ ...macro, wrapScope: e.target.value as 'match' | 'line' })}
                        >
                            <option value="match">Dopasowanie</option>
                            <option value="line">Cala linia</option>
                        </Form.Select>
                    </div>
                )}
            </div>
            {macro.type === 'color' && (
                <Form.Control
                    type="color"
                    size="sm"
                    style={{ width: '2.2rem' }}
                    value={macro.color || '#ffffff'}
                    onChange={e => onChange({ ...macro, color: e.target.value })}
                />
            )}
            {macro.type === 'replace' && (
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Replacement"
                    value={macro.to || ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, to: e.target.value })}
                    style={{ width: '100%', maxWidth: '8rem' }}
                    autoCorrect="off"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                />
            )}
            {macro.type.startsWith('plugin:') && (() => {
                const pluginMacro = pluginMacros.find(pm => pm.id === macro.type);
                if (!pluginMacro?.configFields?.length) return null;
                const config = macro.pluginConfig || {};
                return (
                    <div className="d-flex flex-column gap-1">
                        {pluginMacro.configFields.map(field => (
                            <div key={field.name}>
                                {field.type === 'text' && (
                                    <Form.Control
                                        size="sm"
                                        type="text"
                                        placeholder={field.label}
                                        value={config[field.name] ?? field.defaultValue ?? ''}
                                        onChange={e => onChange({
                                            ...macro,
                                            pluginConfig: { ...config, [field.name]: e.target.value }
                                        })}
                                    />
                                )}
                                {field.type === 'number' && (
                                    <Form.Control
                                        size="sm"
                                        type="number"
                                        placeholder={field.label}
                                        value={config[field.name] ?? field.defaultValue ?? 0}
                                        onChange={e => onChange({
                                            ...macro,
                                            pluginConfig: { ...config, [field.name]: Number(e.target.value) }
                                        })}
                                    />
                                )}
                                {field.type === 'select' && field.options && (
                                    <Form.Select
                                        size="sm"
                                        value={config[field.name] ?? field.defaultValue ?? ''}
                                        onChange={e => onChange({
                                            ...macro,
                                            pluginConfig: { ...config, [field.name]: e.target.value }
                                        })}
                                    >
                                        {field.options.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </Form.Select>
                                )}
                            </div>
                        ))}
                    </div>
                );
            })()}
            <Button size="sm" variant="secondary" onClick={onRemove}><Trash2 size={16} /></Button>
        </div>
    );
}

export interface TriggerEditModalProps {
    show: boolean;
    onClose: () => void;
    onSave: (trigger: UserTrigger) => void;
    trigger?: UserTrigger;
    customSounds: CustomSound[];
    onRequestSoundUpload: () => Promise<string | undefined>;
    pluginMacros: PluginTriggerMacro[];
}

const TriggerEditModal: React.FC<TriggerEditModalProps> = ({
    show,
    onClose,
    onSave,
    trigger,
    customSounds,
    onRequestSoundUpload,
    pluginMacros,
}) => {
    const [triggerType, setTriggerType] = useState<TriggerType>('pattern');
    const [pattern, setPattern] = useState('');
    const [event, setEvent] = useState('');
    const [flags, setFlags] = useState('');
    const [gmcpMsgType, setGmcpMsgType] = useState('');
    const [macros, setMacros] = useState<UserMacro[]>([]);

    useEffect(() => {
        if (trigger) {
            setTriggerType(trigger.type || 'pattern');
            setPattern(trigger.pattern || '');
            setEvent(trigger.event || '');
            setFlags(trigger.flags || '');
            setGmcpMsgType(trigger.gmcpMsgType || '');
            setMacros(trigger.macros ? trigger.macros.map(normalizeMacro) : []);
        } else {
            setTriggerType('pattern');
            setPattern('');
            setEvent('');
            setFlags('');
            setGmcpMsgType('');
            setMacros([]);
        }
    }, [trigger, show]);

    if (!show) return null;

    const isEdit = !!trigger;

    function addMacro() {
        const defaultType = triggerType === 'event' ? 'beep' : 'uppercase';
        const newMacro: UserMacro = defaultType === 'beep'
            ? { type: 'beep', soundKey: 'beep' }
            : { type: defaultType };
        setMacros(prev => [...prev, newMacro]);
    }

    function updateMacro(idx: number, macro: UserMacro) {
        setMacros(prev => prev.map((m, i) => i === idx ? macro : m));
    }

    function removeMacro(idx: number) {
        setMacros(prev => prev.filter((_, i) => i !== idx));
    }

    function handleSave() {
        let entry: UserTrigger;
        if (triggerType === 'event') {
            if (!event) return;
            entry = { type: 'event', event, macros };
        } else {
            const p = pattern.trim();
            if (!p) return;
            entry = { type: 'pattern', pattern: p, macros };
            if (flags.trim()) {
                entry.flags = flags.trim();
            }
            if (gmcpMsgType.trim()) {
                entry.gmcpMsgType = gmcpMsgType.trim();
            }
        }
        onSave(entry);
    }

    const isValid = triggerType === 'event' ? !!event : !!pattern.trim();

    return (
        <div
            className="modal show d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}
            onClick={onClose}
        >
            <div
                className="modal-dialog modal-dialog-centered modal-lg"
                style={{ maxHeight: '90vh' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-content" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                    <div className="modal-header">
                        <h5 className="modal-title">
                            {isEdit ? 'Edytuj trigger' : 'Dodaj trigger'}
                        </h5>
                        <button type="button" className="btn-close" onClick={onClose} />
                    </div>
                    <div className="modal-body" style={{ overflowY: 'auto', minHeight: '40vh' }}>
                        <div className="d-flex gap-2 mb-3">
                            <Form.Check
                                type="radio"
                                id="modal-triggerType-pattern"
                                label="Wzorzec tekstu"
                                checked={triggerType === 'pattern'}
                                onChange={() => {
                                    setTriggerType('pattern');
                                    setMacros(prev => prev.filter(m =>
                                        !EVENT_COMPATIBLE_MACROS.has(m.type) || m.type.startsWith('plugin:') || EVENT_COMPATIBLE_MACROS.has(m.type)
                                    ));
                                }}
                            />
                            <Form.Check
                                type="radio"
                                id="modal-triggerType-event"
                                label="Zdarzenie"
                                checked={triggerType === 'event'}
                                onChange={() => {
                                    setTriggerType('event');
                                    setMacros(prev => prev.filter(m =>
                                        EVENT_COMPATIBLE_MACROS.has(m.type) || m.type.startsWith('plugin:')
                                    ));
                                }}
                            />
                        </div>

                        {triggerType === 'pattern' ? (
                            <>
                                <div className="d-flex gap-2 mb-2 align-items-start">
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        placeholder="Pattern"
                                        value={pattern}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                                        className="font-monospace flex-grow-1"
                                        autoCorrect="off"
                                        autoComplete="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                    />
                                    <FlagsPicker value={flags} onChange={setFlags} />
                                </div>
                                <div className="mb-3">
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        list="gmcp-msg-types"
                                        placeholder="Typ wiadomosci (opcjonalnie)"
                                        value={gmcpMsgType}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setGmcpMsgType(e.target.value)}
                                        autoCorrect="off"
                                        autoComplete="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                    />
                                    <datalist id="gmcp-msg-types">
                                        {GMCP_MSG_TYPES.map(t => (
                                            <option key={t.id} value={t.id}>{t.label}</option>
                                        ))}
                                    </datalist>
                                </div>
                            </>
                        ) : (
                            <div className="mb-3">
                                <Form.Select
                                    size="sm"
                                    value={event}
                                    onChange={(e) => setEvent(e.target.value)}
                                >
                                    <option value="">Wybierz zdarzenie...</option>
                                    {(() => {
                                        const byCategory = new Map<string, SupportedEvent[]>();
                                        for (const ev of SUPPORTED_EVENTS) {
                                            if (!byCategory.has(ev.category)) byCategory.set(ev.category, []);
                                            byCategory.get(ev.category)!.push(ev);
                                        }
                                        return Array.from(byCategory.entries()).map(([category, events]) => (
                                            <optgroup key={category} label={category}>
                                                {events.map(ev => (
                                                    <option key={ev.id} value={ev.id}>{ev.label}</option>
                                                ))}
                                            </optgroup>
                                        ));
                                    })()}
                                </Form.Select>
                            </div>
                        )}

                        <div className="d-flex align-items-center gap-2 mb-2">
                            <label className="form-label mb-0">Akcje</label>
                            <button type="button" className="btn btn-primary py-0 px-2" style={{ fontSize: '0.75rem' }} onClick={addMacro}>Dodaj akcję</button>
                        </div>
                        {macros.map((m, i) => (
                            <MacroEditor
                                key={i}
                                macro={m}
                                onChange={macro => updateMacro(i, macro)}
                                onRemove={() => removeMacro(i)}
                                sounds={customSounds}
                                onRequestSoundUpload={onRequestSoundUpload}
                                pluginMacros={pluginMacros}
                                isEventTrigger={triggerType === 'event'}
                            />
                        ))}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Anuluj
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSave}
                            disabled={!isValid}
                        >
                            {isEdit ? 'Zapisz' : 'Dodaj'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TriggerEditModal;
