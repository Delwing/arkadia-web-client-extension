import { useEffect, useState, ChangeEvent, useRef } from "react";
import { Button, Form } from "react-bootstrap";
import { TiDelete, TiEdit } from "react-icons/ti";
import storage from "@modules/core/storage";
import { CUSTOM_SOUNDS_STORAGE_KEY, CustomSound, getCustomSounds, saveCustomSounds } from "@modules/core/customSounds";
import {
    getRegisteredTriggerMacros,
    isTriggerMacroAvailable,
    type PluginTriggerMacro,
} from "@modules/core/pluginTriggerMacroRegistry";
import eventBus from "@modules/core/eventBus";

export type BuiltInMacroType = 'uppercase' | 'color' | 'replace' | 'beep' | 'mute' | 'unmute' | 'command' | 'slowBlink' | 'rapidBlink' | 'dim' | 'functionalBind';

export type DimEasing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface UserMacro {
    type: BuiltInMacroType | string;  // string allows plugin macros like "plugin:..."
    color?: string;
    to?: string;
    command?: string;
    soundKey?: string;
    label?: string;
    pluginConfig?: Record<string, any>;
    // Dim effect options
    dimStartOpacity?: number;
    dimEndOpacity?: number;
    dimDuration?: number;
    dimEasing?: DimEasing;
}

export type TriggerType = 'pattern' | 'event';

export interface UserTrigger {
    type?: TriggerType;  // defaults to 'pattern' for backwards compatibility
    pattern?: string;    // for pattern triggers
    event?: string;      // for event triggers (e.g., 'kill', 'combatState')
    flags?: string;      // for pattern triggers only
    macros: UserMacro[];
}

export interface SupportedEvent {
    id: string;
    label: string;
    category: string;
}

export const SUPPORTED_EVENTS: SupportedEvent[] = [
    // Combat
    { id: 'kill', label: 'Zabicie (ja/druzyna)', category: 'Walka' },
    { id: 'enemyKilled', label: 'Wrog zabity', category: 'Walka' },
    { id: 'allEnemiesKilled', label: 'Wszyscy wrogowie zabici', category: 'Walka' },
    { id: 'combatState:true', label: 'Walka - start', category: 'Walka' },
    { id: 'combatState:false', label: 'Walka - koniec', category: 'Walka' },
    { id: 'enemy.paralyzed', label: 'Wrog ogluszony', category: 'Walka' },
    { id: 'enemy.paralyzed.end', label: 'Wrog - koniec ogluszenia', category: 'Walka' },
    { id: 'enemy.broken_defense', label: 'Wrog - zlamana obrona', category: 'Walka' },

    // Connection
    { id: 'client.connect', label: 'Polaczenie', category: 'Polaczenie' },
    { id: 'client.disconnect', label: 'Rozlaczenie', category: 'Polaczenie' },

    // Timers
    { id: 'zaskTimer', label: 'Timer zaskoczenia', category: 'Timery' },
    { id: 'coverTimer', label: 'Timer oslony', category: 'Timery' },
    { id: 'transportTimer', label: 'Timer transportu', category: 'Timery' },
];

// Macro types that work without text context (for event triggers)
const EVENT_COMPATIBLE_MACROS: Set<string> = new Set(['beep', 'mute', 'unmute', 'command', 'functionalBind']);

function normalizeMacro(macro: UserMacro): UserMacro {
    if (macro.type === 'beep' && (!macro.soundKey || typeof macro.soundKey !== 'string')) {
        return { ...macro, soundKey: 'beep' };
    }
    return macro;
}

function normalizeTrigger(trigger: UserTrigger): UserTrigger {
    const macros = Array.isArray(trigger.macros) ? trigger.macros.map(normalizeMacro) : [];
    return { ...trigger, macros };
}

function normalizeTriggerList(list: UserTrigger[] = []): UserTrigger[] {
    return list.map(normalizeTrigger);
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
        <div className="d-flex align-items-start gap-2 mb-1">
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
                    <option value="beep">Dzwiek</option>
                    <option value="mute">Wycisz dzwieki</option>
                    <option value="unmute">Wlacz dzwieki</option>
                    <option value="command">Komenda</option>
                    {!isEventTrigger && <option value="slowBlink">Wolne miganie</option>}
                    {!isEventTrigger && <option value="rapidBlink">Szybkie miganie</option>}
                    {!isEventTrigger && <option value="dim">Pulsowanie</option>}
                    <option value="functionalBind">Funkcyjny bind</option>
                    {(() => {
                        // Group macros by plugin
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
                        <option value="beep">Domyślny beep</option>
                        {sounds.map(sound => (
                            <option key={sound.key} value={sound.key}>{sound.name}</option>
                        ))}
                        <option value="__upload__">Dodaj dźwięk…</option>
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
                        />
                        <Form.Control
                            className="mt-1 font-monospace"
                            type="text"
                            size="sm"
                            placeholder="Command (np. 'zabij cel')"
                            value={macro.command || ''}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, command: e.target.value })}
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
                />
            )}
            {/* Plugin macro config fields */}
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
            <Button size="sm" variant="secondary" onClick={onRemove}><TiDelete /></Button>
        </div>
    );
}

function UserTriggers() {
    const [triggers, setTriggers] = useState<UserTrigger[]>([]);
    const [triggerType, setTriggerType] = useState<TriggerType>('pattern');
    const [pattern, setPattern] = useState('');
    const [event, setEvent] = useState('');
    const [flags, setFlags] = useState('');
    const [macros, setMacros] = useState<UserMacro[]>([]);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [filter, setFilter] = useState('');
    const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
    const [pluginMacros, setPluginMacros] = useState<PluginTriggerMacro[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const pendingSoundResolver = useRef<((value?: string) => void) | null>(null);
    const customSoundsRef = useRef<CustomSound[]>([]);

    useEffect(() => {
        customSoundsRef.current = customSounds;
    }, [customSounds]);

    useEffect(() => {
        setPluginMacros(getRegisteredTriggerMacros());
        const handleMacrosChanged = () => {
            setPluginMacros(getRegisteredTriggerMacros());
        };
        eventBus.on('pluginTriggerMacrosChanged', handleMacrosChanged);
        return () => {
            eventBus.off('pluginTriggerMacrosChanged', handleMacrosChanged);
        };
    }, []);

    useEffect(() => {
        let active = true;
        storage.getItem('triggers').then(res => {
            if (!active) return;
            if (res && Array.isArray(res.triggers)) {
                setTriggers(normalizeTriggerList(res.triggers));
            }
        });
        const listener = (changes: { [key: string]: { oldValue: any; newValue: any } }) => {
            if (!active) return;
            if ('triggers' in changes) {
                const value = Array.isArray(changes.triggers.newValue) ? changes.triggers.newValue : [];
                setTriggers(normalizeTriggerList(value));
            }
        };
        storage.onChanged?.addListener(listener);
        return () => {
            active = false;
            storage.onChanged?.removeListener?.(listener);
        };
    }, []);

    useEffect(() => {
        let active = true;
        getCustomSounds().then(list => {
            if (active) {
                setCustomSounds(list);
            }
        });
        const listener = (changes: { [key: string]: { oldValue: any; newValue: any } }) => {
            if (!active) return;
            if (CUSTOM_SOUNDS_STORAGE_KEY in changes) {
                getCustomSounds().then(sounds => {
                    if (active) {
                        setCustomSounds(sounds);
                    }
                });
            }
        };
        storage.onChanged?.addListener(listener);
        return () => {
            active = false;
            storage.onChanged?.removeListener?.(listener);
            pendingSoundResolver.current?.(undefined);
            pendingSoundResolver.current = null;
        };
    }, []);

    function requestSoundUpload(): Promise<string | undefined> {
        return new Promise(resolve => {
            if (pendingSoundResolver.current) {
                pendingSoundResolver.current(undefined);
            }
            pendingSoundResolver.current = resolve;
            fileInputRef.current?.click();
        });
    }

    function handleSoundFileChange(e: ChangeEvent<HTMLInputElement>) {
        const resolver = pendingSoundResolver.current;
        pendingSoundResolver.current = null;
        const file = e.target.files?.[0] ?? null;
        e.target.value = '';
        if (!file) {
            resolver?.(undefined);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                resolver?.(undefined);
                return;
            }
            const baseName = file.name.replace(/\.[^/.]+$/, '') || file.name;
            const existingKeys = new Set(customSoundsRef.current.map(sound => sound.key));
            const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const prefix = slug ? `user:${slug}` : `user:${Date.now()}`;
            let key = prefix;
            let counter = 1;
            while (existingKeys.has(key)) {
                key = `${prefix}-${counter++}`;
            }
            const sound: CustomSound = { key, name: baseName, data: result };
            const nextSounds = [...customSoundsRef.current, sound];
            customSoundsRef.current = nextSounds;
            setCustomSounds(nextSounds);
            void saveCustomSounds(nextSounds)
                .catch(error => {
                    console.error('Failed to save custom sound', error);
                })
                .finally(() => {
                    resolver?.(sound.key);
                });
        };
        reader.onerror = () => {
            resolver?.(undefined);
        };
        reader.readAsDataURL(file);
    }

    function saveList(list: UserTrigger[]) {
        const normalized = normalizeTriggerList(list);
        setTriggers(normalized);
        storage.setItem('triggers', normalized);
    }

    function resetForm() {
        setTriggerType('pattern');
        setPattern('');
        setEvent('');
        setFlags('');
        setMacros([]);
        setEditIndex(null);
    }

    function openNew() {
        resetForm();
        setShowCreateForm(true);
    }

    function edit(idx: number) {
        const t = triggers[idx];
        setTriggerType(t.type || 'pattern');
        setPattern(t.pattern || '');
        setEvent(t.event || '');
        setFlags(t.flags || '');
        setMacros(t.macros ? t.macros.map(normalizeMacro) : []);
        setEditIndex(idx);
        setShowCreateForm(false);
    }

    function remove(idx: number) {
        if (!confirm('Delete trigger?')) return;
        const updated = triggers.filter((_, i) => i !== idx);
        saveList(updated);
    }

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

    function save() {
        const list = [...triggers];
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
        }

        if (editIndex === null) {
            list.push(entry);
        } else {
            list[editIndex] = entry;
        }
        saveList(list);
        resetForm();
        setShowCreateForm(false);
    }

    function macrosToText(list: UserMacro[]): string {
        return list
            .map(m => {
                switch (m.type) {
                    case 'uppercase':
                        return 'uppercase';
                    case 'color':
                        return m.color ? `color ${m.color}` : 'color';
                    case 'replace':
                        return m.to ? `replace ${m.to}` : 'replace';
                    case 'beep': {
                        const key = m.soundKey || 'beep';
                        if (key === 'beep') {
                            return 'sound beep';
                        }
                        const sound = customSounds.find(s => s.key === key);
                        return sound ? `sound ${sound.name}` : 'sound';
                    }
                    case 'mute':
                        return 'mute';
                    case 'unmute':
                        return 'unmute';
                    case 'command':
                        return m.command ? `command ${m.command}` : 'command';
                    case 'slowBlink':
                        return 'slow blink';
                    case 'rapidBlink':
                        return 'rapid blink';
                    case 'functionalBind':
                        return m.label && m.command ? `bind [${m.label}] → ${m.command}` : 'functional bind';
                    default:
                        return m.type;
                }
            })
            .join(', ');
    }

    const filteredTriggers = triggers
        .map((t, idx) => ({ ...t, idx }))
        .filter(t => {
            const searchText = filter.toLowerCase();
            if (t.type === 'event' && t.event) {
                const eventInfo = SUPPORTED_EVENTS.find(e => e.id === t.event);
                return t.event.toLowerCase().includes(searchText) ||
                    (eventInfo?.label.toLowerCase().includes(searchText) ?? false);
            }
            return (t.pattern || '').toLowerCase().includes(searchText);
        });

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={handleSoundFileChange}
            />
            <div className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 w-100">
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Filter"
                    value={filter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                    className="flex-grow-1"
                    style={{ minWidth: 0 }}
                />
                <Button size="sm" className="w-100 w-md-auto text-nowrap" onClick={openNew}>Dodaj trigger</Button>
            </div>
            
            {showCreateForm && (
                <div className="border rounded p-3 mb-3">
                    <h6 className="mb-3">{editIndex === null ? 'Dodaj trigger' : 'Edytuj trigger'}</h6>
                    <Form.Group className="d-flex flex-column gap-2">
                        <div className="d-flex gap-2 mb-2">
                            <Form.Check
                                type="radio"
                                id="triggerType-pattern"
                                label="Wzorzec tekstu"
                                checked={triggerType === 'pattern'}
                                onChange={() => {
                                    setTriggerType('pattern');
                                    // Filter out incompatible macros when switching
                                    setMacros(prev => prev.filter(m =>
                                        !EVENT_COMPATIBLE_MACROS.has(m.type) || m.type.startsWith('plugin:') || EVENT_COMPATIBLE_MACROS.has(m.type)
                                    ));
                                }}
                            />
                            <Form.Check
                                type="radio"
                                id="triggerType-event"
                                label="Zdarzenie"
                                checked={triggerType === 'event'}
                                onChange={() => {
                                    setTriggerType('event');
                                    // Filter out text-only macros when switching to event
                                    setMacros(prev => prev.filter(m =>
                                        EVENT_COMPATIBLE_MACROS.has(m.type) || m.type.startsWith('plugin:')
                                    ));
                                }}
                            />
                        </div>
                        {triggerType === 'pattern' ? (
                            <div className="d-flex gap-2">
                                <Form.Control
                                    type="text"
                                    size="sm"
                                    placeholder="Pattern"
                                    value={pattern}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                                    className="font-monospace flex-grow-1"
                                />
                                <Form.Control
                                    type="text"
                                    size="sm"
                                    placeholder="Flagi (np. i, g, gi)"
                                    value={flags}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFlags(e.target.value)}
                                    className="font-monospace"
                                    style={{ width: '120px' }}
                                />
                            </div>
                        ) : (
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
                        )}
                        {macros.map((m, i) => (
                            <MacroEditor
                                key={i}
                                macro={m}
                                onChange={macro => updateMacro(i, macro)}
                                onRemove={() => removeMacro(i)}
                                sounds={customSounds}
                                onRequestSoundUpload={requestSoundUpload}
                                pluginMacros={pluginMacros}
                                isEventTrigger={triggerType === 'event'}
                            />
                        ))}
                        <Button size="sm" onClick={addMacro}>Dodaj akcję</Button>
                        <div className="d-flex gap-2 mt-2">
                            <Button size="sm" variant="secondary" onClick={() => { resetForm(); setShowCreateForm(false); }}>Anuluj</Button>
                            <Button size="sm" onClick={save}>{editIndex === null ? 'Dodaj' : 'Zapisz'}</Button>
                        </div>
                    </Form.Group>
                </div>
            )}

            <ul className="list-unstyled">
                {filteredTriggers.map(t => (
                    editIndex === t.idx ? (
                        <li key={t.idx} className="alias-list-item">
                            <div className="border rounded p-3 mb-3">
                                <h6 className="mb-3">Edytuj trigger</h6>
                                <Form.Group className="d-flex flex-column gap-2">
                                    <div className="d-flex gap-2 mb-2">
                                        <Form.Check
                                            type="radio"
                                            id={`triggerType-pattern-${t.idx}`}
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
                                            id={`triggerType-event-${t.idx}`}
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
                                        <div className="d-flex gap-2">
                                            <Form.Control
                                                type="text"
                                                size="sm"
                                                placeholder="Pattern"
                                                value={pattern}
                                                onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                                                className="font-monospace flex-grow-1"
                                            />
                                            <Form.Control
                                                type="text"
                                                size="sm"
                                                placeholder="Flagi (np. i, g, gi)"
                                                value={flags}
                                                onChange={(e: ChangeEvent<HTMLInputElement>) => setFlags(e.target.value)}
                                                className="font-monospace"
                                                style={{ width: '120px' }}
                                            />
                                        </div>
                                    ) : (
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
                                    )}
                                    {macros.map((m, i) => (
                                        <MacroEditor
                                            key={i}
                                            macro={m}
                                            onChange={macro => updateMacro(i, macro)}
                                            onRemove={() => removeMacro(i)}
                                            sounds={customSounds}
                                            onRequestSoundUpload={requestSoundUpload}
                                            pluginMacros={pluginMacros}
                                            isEventTrigger={triggerType === 'event'}
                                        />
                                    ))}
                                    <Button size="sm" onClick={addMacro}>Dodaj akcję</Button>
                                    <div className="d-flex gap-2 mt-2">
                                        <Button size="sm" variant="secondary" onClick={resetForm}>Anuluj</Button>
                                        <Button size="sm" onClick={save}>Zapisz</Button>
                                    </div>
                                </Form.Group>
                            </div>
                        </li>
                    ) : (
                        <li key={t.idx} className="alias-list-item d-flex flex-column flex-md-row gap-2 align-items-stretch align-items-md-center">
                            <div className="alias-entry flex-grow-1">
                                {t.type === 'event' && t.event ? (
                                    <>
                                        <span className="text-muted me-1">[Zdarzenie]</span>
                                        <code className="alias-pattern">
                                            {SUPPORTED_EVENTS.find(e => e.id === t.event)?.label || t.event}
                                        </code>
                                    </>
                                ) : (
                                    <>
                                        <code className="alias-pattern">{t.pattern}</code>
                                        {t.flags && <code className="alias-flags text-muted ms-1">/{t.flags}</code>}
                                    </>
                                )}
                                {t.macros?.length ? (
                                    <>
                                        <span className="alias-divider">→</span>
                                        <code className="alias-command">{macrosToText(t.macros)}</code>
                                    </>
                                ) : null}
                            </div>
                            <div className="alias-list-item-actions">
                                <Button size="sm" variant="secondary" onClick={() => edit(t.idx)}><TiEdit /></Button>
                                <Button size="sm" variant="danger" onClick={() => remove(t.idx)}><TiDelete /></Button>
                            </div>
                        </li>
                    )
                ))}
            </ul>
        </div>
    );
}

export default UserTriggers;
