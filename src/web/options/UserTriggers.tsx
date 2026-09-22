import { useEffect, useState, ChangeEvent } from "react";
import { Pencil, Zap } from "lucide-react";
import { Button, DeleteButton, Input } from "@web-ui/primitives/index.ts";
import { globalStorage } from "@modules/core/storage";
import { withAutomationId, type AutomationMeta } from "@modules/core/automation";
import TriggerEditModal from "./TriggerEditModal";
import { normalizeTriggerList } from "./userTriggerNormalize";
import { useCustomSounds, usePluginMacros } from "./useCustomSounds";
import {
    AutomationBadges,
    MacroChip,
    automationSearchText,
    isSwitchedOff,
    useAutomationGroups,
} from "./automationListParts";
import {
    SUPPORTED_EVENTS,
    GMCP_EVENT_CATEGORY,
    CONDITION_OPERATORS,
    type EventArg,
    type SupportedEvent,
    type TriggerCondition,
    type ConditionOperator,
} from "@client/scripts/userTriggers";

export type BuiltInMacroType = 'uppercase' | 'color' | 'replace' | 'beep' | 'mute' | 'unmute' | 'command' | 'slowBlink' | 'rapidBlink' | 'dim' | 'functionalBind' | 'wrap' | 'notify' | 'push' | 'speak';

export type DimEasing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface UserMacro {
    type: BuiltInMacroType | string;  // string allows plugin macros like "plugin:..."
    color?: string;
    to?: string;
    command?: string;
    soundKey?: string;
    label?: string;
    message?: string;  // notify/push/speak text; empty falls back to matched text for pattern triggers
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

export interface UserTrigger extends AutomationMeta {
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
    const { customSounds, requestSoundUpload, soundInput } = useCustomSounds();
    const pluginMacros = usePluginMacros();
    const groups = useAutomationGroups();

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

    function saveList(list: UserTrigger[]) {
        const normalized = normalizeTriggerList(list).map(withAutomationId);
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

    const filteredTriggers = triggers
        .map((t, idx) => ({ ...t, idx }))
        .filter(t => {
            const searchText = filter.toLowerCase();
            if (!searchText) return true;
            if (automationSearchText(t, groups).includes(searchText)) return true;
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
            {soundInput}
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
                        <div key={t.idx} className={`alias-card${isSwitchedOff(t, groups) ? ' is-inactive' : ''}`}>
                            <div className="alias-card-body">
                                <AutomationBadges item={t} groups={groups} />
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
                                    <div className="trigger-chips">
                                        {t.macros.map((m, i) => (
                                            <MacroChip key={i} macro={m} customSounds={customSounds} pluginMacros={pluginMacros} />
                                        ))}
                                    </div>
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
