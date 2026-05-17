import { useEffect, useState, ChangeEvent, useRef } from "react";
import { Button, Form } from "react-bootstrap";
import { Trash2, Pencil, Zap } from "lucide-react";
import { globalStorage } from "@modules/core/storage";
import { CustomSound, getCustomSounds, saveCustomSounds } from "@modules/core/customSounds";
import {
    getRegisteredTriggerMacros,
    type PluginTriggerMacro,
} from "@modules/core/pluginTriggerMacroRegistry";
import eventBus from "@modules/core/eventBus";
import TriggerEditModal from "./TriggerEditModal";

export type BuiltInMacroType = 'uppercase' | 'color' | 'replace' | 'beep' | 'mute' | 'unmute' | 'command' | 'slowBlink' | 'rapidBlink' | 'dim' | 'functionalBind' | 'wrap';

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
    // Wrap (prefix/suffix) options
    wrapPrefix?: string;
    wrapSuffix?: string;
    wrapScope?: 'match' | 'line';
}

export type TriggerType = 'pattern' | 'event';

export interface UserTrigger {
    type?: TriggerType;  // defaults to 'pattern' for backwards compatibility
    pattern?: string;    // for pattern triggers
    event?: string;      // for event triggers (e.g., 'kill', 'combatState')
    flags?: string;      // for pattern triggers only
    gmcpMsgType?: string; // limit pattern trigger to specific GMCP message type
    macros: UserMacro[];
}

export interface GmcpMsgTypeOption {
    id: string;
    label: string;
}

export const GMCP_MSG_TYPES: GmcpMsgTypeOption[] = [
    { id: 'combat.avatar', label: 'Walka postaci gracza' },
    { id: 'combat.team', label: 'Walka druzyny' },
    { id: 'combat.others', label: 'Walka innych' },
    { id: 'room.combat', label: 'Opis walki na lokacji' },
    { id: 'comm', label: 'Mowienie/szeptanie/krzyczenie' },
    { id: 'emotes', label: 'Emocje skierowane do gracza' },
    { id: 'room.long', label: 'Dlugi opis lokacji' },
    { id: 'room.short', label: 'Krotki opis lokacji' },
    { id: 'room.item', label: 'Opisy przedmiotow na lokacji' },
    { id: 'room.exits', label: 'Wyjscia z lokacji' },
    { id: 'room.contents.living', label: 'Istoty zywe na lokacji' },
    { id: 'room.contents.object', label: 'Obiekty na lokacji' },
    { id: 'room.contents', label: 'Nieokreslone obiekty na lokacji' },
    { id: 'living.long', label: 'Dlugi opis zywej istoty' },
    { id: 'object.long', label: 'Dlugi opis obiektu' },
    { id: 'system', label: 'Komunikaty systemowe' },
    { id: 'system.login', label: 'Logowanie i konto' },
    { id: 'mail', label: 'Poczta' },
    { id: 'editor.mail', label: 'Edycja listow' },
    { id: 'editor', label: 'Edycja tekstow' },
    { id: 'notification.mail', label: 'Powiadomienia - poczta' },
    { id: 'notification.common', label: 'Powiadomienia - Wiesci' },
    { id: 'notification.knowledge', label: 'Powiadomienia - wiedza' },
    { id: 'notification.relations', label: 'Powiadomienia - relacje' },
    { id: 'notification.boards', label: 'Powiadomienia - tablice' },
    { id: 'notification', label: 'Pozostale powiadomienia' },
    { id: 'prompt', label: 'Znak zachety terminala' },
    { id: 'other', label: 'Pozostale komunikaty' },
];

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

function UserTriggers() {
    const [triggers, setTriggers] = useState<UserTrigger[]>([]);
    const [filter, setFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalTrigger, setModalTrigger] = useState<{ trigger: UserTrigger; index: number } | undefined>(undefined);
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
        const saved = globalStorage.get('triggers');
        if (Array.isArray(saved)) {
            setTriggers(normalizeTriggerList(saved));
        }
        const unsub = globalStorage.onChange('triggers', (newValue) => {
            if (!active) return;
            const value = Array.isArray(newValue) ? newValue : [];
            setTriggers(normalizeTriggerList(value));
        });
        return () => {
            active = false;
            unsub();
        };
    }, []);

    useEffect(() => {
        let active = true;
        getCustomSounds().then(list => {
            if (active) {
                setCustomSounds(list);
            }
        });
        const unsub = globalStorage.onChange('custom_sounds', () => {
            if (!active) return;
            getCustomSounds().then(sounds => {
                if (active) {
                    setCustomSounds(sounds);
                }
            });
        });
        return () => {
            active = false;
            unsub();
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
        globalStorage.set('triggers', normalized);
    }

    function openNew() {
        setModalTrigger(undefined);
        setShowModal(true);
    }

    function openEdit(idx: number) {
        setModalTrigger({ trigger: triggers[idx], index: idx });
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setModalTrigger(undefined);
    }

    function handleSave(trigger: UserTrigger) {
        const updated = [...triggers];
        if (modalTrigger !== undefined) {
            updated[modalTrigger.index] = trigger;
        } else {
            updated.push(trigger);
        }
        saveList(updated);
        closeModal();
    }

    function remove(idx: number) {
        if (!confirm('Delete trigger?')) return;
        const updated = triggers.filter((_, i) => i !== idx);
        saveList(updated);
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
                    case 'wrap': {
                        const parts: string[] = [];
                        if (m.wrapPrefix) parts.push(`"${m.wrapPrefix}" +`);
                        parts.push(m.wrapScope === 'line' ? 'linia' : 'dopasowanie');
                        if (m.wrapSuffix) parts.push(`+ "${m.wrapSuffix}"`);
                        return `wrap ${parts.join(' ')}`;
                    }
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
            if (!searchText) return true;
            if (t.type === 'event' && t.event) {
                const eventInfo = SUPPORTED_EVENTS.find(e => e.id === t.event);
                return t.event.toLowerCase().includes(searchText) ||
                    (eventInfo?.label.toLowerCase().includes(searchText) ?? false);
            }
            if ((t.pattern || '').toLowerCase().includes(searchText)) return true;
            if (t.gmcpMsgType?.toLowerCase().includes(searchText)) return true;
            return false;
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
                    placeholder="Filtruj"
                    value={filter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                    className="flex-grow-1"
                    style={{ minWidth: 0 }}
                />
                <Button size="sm" className="w-100 w-md-auto text-nowrap" onClick={openNew}>Dodaj trigger</Button>
            </div>

            <div className="d-flex flex-column gap-2">
                {filteredTriggers.map(t => (
                    <div key={t.idx} className="alias-card">
                        <div className="alias-card-body">
                            <div className="alias-entry">
                                {t.type === 'event' && t.event ? (
                                    <>
                                        <Zap size={16} className="text-warning" style={{ flexShrink: 0 }} />
                                        <code className="alias-pattern">
                                            {SUPPORTED_EVENTS.find(e => e.id === t.event)?.label || t.event}
                                        </code>
                                    </>
                                ) : (
                                    <>
                                        <code className="alias-pattern">{t.pattern}</code>
                                        {t.flags && <code className="alias-flags text-muted ms-1">/{t.flags}</code>}
                                        {t.gmcpMsgType && <span className="badge bg-secondary ms-1">{t.gmcpMsgType}</span>}
                                    </>
                                )}
                                {t.macros?.length ? (
                                    <span className="alias-entry-command">
                                        <code className="alias-command">{macrosToText(t.macros)}</code>
                                    </span>
                                ) : null}
                            </div>
                        </div>
                        <div className="alias-card-actions">
                            <Button size="sm" variant="secondary" onClick={() => openEdit(t.idx)}><Pencil size={16} /></Button>
                            <Button size="sm" variant="danger" onClick={() => remove(t.idx)}><Trash2 size={16} /></Button>
                        </div>
                    </div>
                ))}
            </div>

            <TriggerEditModal
                show={showModal}
                onClose={closeModal}
                onSave={handleSave}
                trigger={modalTrigger?.trigger}
                customSounds={customSounds}
                onRequestSoundUpload={requestSoundUpload}
                pluginMacros={pluginMacros}
            />
        </div>
    );
}

export default UserTriggers;
