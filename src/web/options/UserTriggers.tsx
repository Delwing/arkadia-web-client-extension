import { useEffect, useState, ChangeEvent, useRef } from "react";
import { Pencil, Zap } from "lucide-react";
import { Button, DeleteButton, Input } from "@web-ui/primitives/index.ts";
import { globalStorage } from "@modules/core/storage";
import { CustomSound, getCustomSounds, saveCustomSounds } from "@modules/core/customSounds";
import {
    getRegisteredTriggerMacros,
    type PluginTriggerMacro,
} from "@modules/core/pluginTriggerMacroRegistry";
import eventBus from "@modules/core/eventBus";
import TriggerEditModal from "./TriggerEditModal";
import { normalizeTriggerList } from "./userTriggerNormalize";
import {
    SUPPORTED_EVENTS,
    GMCP_EVENT_CATEGORY,
    CONDITION_OPERATORS,
    type EventArg,
    type SupportedEvent,
    type TriggerCondition,
    type ConditionOperator,
} from "@client/scripts/userTriggers";

export type BuiltInMacroType = 'uppercase' | 'color' | 'replace' | 'beep' | 'mute' | 'unmute' | 'command' | 'slowBlink' | 'rapidBlink' | 'dim' | 'functionalBind' | 'wrap' | 'notify' | 'push';

export type DimEasing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface UserMacro {
    type: BuiltInMacroType | string;  // string allows plugin macros like "plugin:..."
    color?: string;
    to?: string;
    command?: string;
    soundKey?: string;
    label?: string;
    message?: string;  // notification text (notify); empty falls back to matched text for pattern triggers
    /** push only: send even inside the rate-limit window. Mirrors the field on
     *  `UserMacro` in @client/scripts/userTriggers, which this duplicates. */
    bypassCooldown?: boolean;
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
    conditions?: TriggerCondition[]; // event triggers only; all must hold
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

// The event catalogue lives with the runtime that fires the events, in
// @client/scripts/userTriggers, and is re-exported here rather than copied.
// It was duplicated before, and the copies drifted: events added on the client
// side never appeared in this editor at all.
export type { SupportedEvent, EventArg, TriggerCondition, ConditionOperator };
export { SUPPORTED_EVENTS, GMCP_EVENT_CATEGORY, CONDITION_OPERATORS };

/** `hp < 3, name jest Zbojca` — the one-line summary shown on a trigger card. */
function conditionsToText(conditions: TriggerCondition[] = []): string {
    return conditions
        .filter(c => c.arg)
        .map(c => {
            const op = CONDITION_OPERATORS.find(o => o.id === c.op)?.label ?? c.op;
            return `${c.arg} ${op} ${c.value}`;
        })
        .join(', ');
}

// Shared with the AI assistant's apply path — see userTriggerNormalize.ts for
// why these no longer live here.

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
        if (!confirm('Czy na pewno chcesz usunąć ten trigger?')) return;
        const updated = triggers.filter((_, i) => i !== idx);
        saveList(updated);
    }

    /** One chip per action, named as in the editor's action list. */
    function macroChip(m: UserMacro, i: number) {
        let text: string;
        let swatch: string | undefined;
        switch (m.type) {
            case 'uppercase': text = 'Wielkie litery'; break;
            case 'color': text = 'Koloruj'; swatch = m.color; break;
            case 'replace': text = m.to ? `Zamien: ${m.to}` : 'Zamien'; break;
            case 'beep': {
                const key = m.soundKey || 'beep';
                const sound = key === 'beep' ? undefined : customSounds.find(s => s.key === key);
                text = key === 'beep' ? 'Dzwiek' : `Dzwiek: ${sound?.name ?? key}`;
                break;
            }
            case 'mute': text = 'Wycisz dzwieki'; break;
            case 'unmute': text = 'Wlacz dzwieki'; break;
            case 'command': text = m.command ? `Komenda: ${m.command}` : 'Komenda'; break;
            case 'slowBlink': text = 'Wolne miganie'; break;
            case 'rapidBlink': text = 'Szybkie miganie'; break;
            case 'dim': text = 'Pulsowanie'; break;
            case 'functionalBind': text = m.label && m.command ? `Bind [${m.label}]: ${m.command}` : 'Funkcyjny bind'; break;
            case 'notify': text = m.message ? `Powiadomienie: ${m.message}` : 'Powiadomienie'; break;
            case 'push': text = (m.message ? `Na telefon: ${m.message}` : 'Na telefon') + (m.bypassCooldown ? ' (zawsze)' : ''); break;
            case 'wrap': {
                const parts: string[] = [];
                if (m.wrapPrefix) parts.push(`"${m.wrapPrefix}" +`);
                parts.push(m.wrapScope === 'line' ? 'linia' : 'dopasowanie');
                if (m.wrapSuffix) parts.push(`+ "${m.wrapSuffix}"`);
                text = `Otocz: ${parts.join(' ')}`;
                break;
            }
            default:
                text = pluginMacros.find(pm => pm.id === m.type)?.label ?? m.type;
        }
        return (
            <span key={i} className="trigger-chip" title={text}>
                {swatch && <span className="trigger-chip__swatch" style={{ backgroundColor: swatch }} />}
                {text}
            </span>
        );
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
        <div className="alias-manager">
            <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={handleSoundFileChange} />
            <div className="alias-manager__toolbar">
                <Input
                    type="search"
                    placeholder="Filtruj"
                    value={filter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                />
                <Button size="sm" variant="solid" onClick={openNew}>Dodaj trigger</Button>
            </div>

            {triggers.length === 0 ? (
                <p className="popup-field__hint alias-manager__empty">
                    Brak triggerów. Trigger reaguje na linię tekstu z gry albo na zdarzenie i wykonuje akcje: koloruje, wysyła komendę, gra dźwięk…
                </p>
            ) : filteredTriggers.length === 0 ? (
                <p className="popup-field__hint alias-manager__empty">Brak triggerów pasujących do filtra.</p>
            ) : (
                <div className="alias-list">
                    {filteredTriggers.map(t => (
                        <div key={t.idx} className="alias-card">
                            <div className="alias-card-body">
                                <div className="alias-entry">
                                    {t.type === 'event' && t.event ? (
                                        <>
                                            <Zap size={14} className="trigger-event-icon" />
                                            <span className="trigger-event-name">
                                                {SUPPORTED_EVENTS.find(e => e.id === t.event)?.label || t.event}
                                            </span>
                                            {t.conditions?.some(c => c.arg) && (
                                                <span className="trigger-conditions">
                                                    gdy {conditionsToText(t.conditions)}
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <code className="alias-pattern">{t.pattern}</code>
                                            {t.flags && <code className="alias-flags">/{t.flags}</code>}
                                            {t.gmcpMsgType && <span className="alias-override-char">{t.gmcpMsgType}</span>}
                                        </>
                                    )}
                                </div>
                                {t.macros?.length ? (
                                    <div className="trigger-chips">{t.macros.map(macroChip)}</div>
                                ) : null}
                            </div>
                            <div className="alias-card-actions">
                                <Button size="sm" variant="ghost" className="popup-btn--icon" title="Edytuj" onClick={() => openEdit(t.idx)}>
                                    <Pencil size={15} strokeWidth={1.75} />
                                </Button>
                                <DeleteButton onClick={() => remove(t.idx)} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

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
