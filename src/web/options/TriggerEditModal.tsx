import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { CustomSound } from '@modules/core/customSounds';
import type { PluginTriggerMacro } from '@modules/core/pluginTriggerMacroRegistry';
import { LINELESS_MACRO_TYPES } from '@client/scripts/userTriggers';
import { Button, Check, Dialog, Field, Input, Segmented, Select } from '@web-ui/primitives/index.ts';
import { usePopover } from '@web/layout/hooks/usePopover.ts';
import type { UserTrigger, UserMacro, TriggerType, SupportedEvent, EventArg, TriggerCondition } from './UserTriggers';
import { MacroEditor, normalizeMacro } from './MacroEditor';
import { AutomationMetaFields, automationMetaDraft, automationMetaFromDraft } from './AutomationMetaFields';
import { SUPPORTED_EVENTS, GMCP_MSG_TYPES, GMCP_EVENT_CATEGORY, CONDITION_OPERATORS } from './UserTriggers';

const GMCP_EVENTS = SUPPORTED_EVENTS.filter(e => e.category === GMCP_EVENT_CATEGORY);
const GMCP_EVENT_IDS = new Set(GMCP_EVENTS.map(e => e.id));
/** Value of the single "GMCP" option standing in for all GMCP packages in the event picker. */
const GMCP_GROUP_VALUE = '__gmcp__';

const AVAILABLE_FLAGS = [
    { flag: 'i', label: 'Ignoruj wielkosc liter' },
    { flag: 'g', label: 'Globalnie (wszystkie wystapienia)' },
    { flag: 'm', label: 'Wieloliniowy' },
];

const TRIGGER_TYPE_OPTIONS: { value: TriggerType; label: string }[] = [
    { value: 'pattern', label: 'Wzorzec tekstu' },
    { value: 'event', label: 'Zdarzenie' },
];

function FlagsPicker({ value, onChange }: { value: string; onChange: (flags: string) => void }) {
    const popover = usePopover({ width: 240 });

    const toggle = (flag: string) => {
        const next = value.includes(flag)
            ? value.replace(flag, '')
            : value + flag;
        onChange(next);
    };

    return (
        <div className="trigger-flags" ref={popover.rootRef}>
            <button
                ref={popover.anchorRef}
                type="button"
                className={`popup-btn popup-btn--control trigger-flags__toggle${value ? ' is-set' : ''}`}
                onClick={popover.toggle}
                title="Flagi wyrazenia regularnego"
            >
                {value ? `/${value}` : 'Flagi'}
            </button>
            {popover.style && (
                <div className="popup-popover trigger-flags__menu" style={popover.style}>
                    {AVAILABLE_FLAGS.map(({ flag, label }) => (
                        <Check
                            key={flag}
                            label={<><code>{flag}</code> {label}</>}
                            checked={value.includes(flag)}
                            onChange={() => toggle(flag)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function operatorsFor(arg: EventArg | undefined) {
    return arg?.type
        ? CONDITION_OPERATORS.filter(o => o.types.includes(arg.type!))
        : CONDITION_OPERATORS;
}

/**
 * Conditions on an event trigger's payload, limited to the event's declared
 * args — the caller only renders this for events that have some.
 */
function ConditionsEditor({
    conditions,
    onChange,
    args,
}: {
    conditions: TriggerCondition[];
    onChange: (conditions: TriggerCondition[]) => void;
    args: EventArg[];
}) {
    const update = (idx: number, patch: Partial<TriggerCondition>) => {
        onChange(conditions.map((c, i) => {
            if (i !== idx) return c;
            const next = { ...c, ...patch };
            const allowed = operatorsFor(args.find(a => a.name === next.arg));
            if (!allowed.some(o => o.id === next.op)) next.op = allowed[0].id;
            return next;
        }));
    };

    const add = () => {
        const arg = args[0];
        onChange([...conditions, { arg: arg.name, op: operatorsFor(arg)[0].id, value: '' }]);
    };

    return (
        <div className="trigger-section trigger-conditions-editor">
            <div className="trigger-section__head">
                <h3 className="trigger-section__title">Warunki</h3>
                <Button variant="ghost" size="sm" onClick={add}>Dodaj warunek</Button>
            </div>
            {conditions.map((c, idx) => {
                const arg = args.find(a => a.name === c.arg);
                return (
                    <div key={idx} className="popup-inline trigger-condition">
                        <Select
                            className="trigger-condition__arg"
                            value={c.arg}
                            onChange={(e) => update(idx, { arg: e.target.value })}
                        >
                            {args.map(a => <option key={a.name} value={a.name}>{a.label}</option>)}
                        </Select>
                        <Select
                            className="trigger-condition__op"
                            value={c.op}
                            onChange={(e) => update(idx, { op: e.target.value as TriggerCondition['op'] })}
                        >
                            {operatorsFor(arg).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </Select>
                        {arg?.type === 'boolean' ? (
                            <Select
                                value={c.value}
                                onChange={(e) => update(idx, { value: e.target.value })}
                            >
                                <option value="">—</option>
                                <option value="true">tak</option>
                                <option value="false">nie</option>
                            </Select>
                        ) : (
                            <Input
                                mono
                                type={arg?.type === 'number' ? 'number' : 'text'}
                                placeholder="Wartosc"
                                value={c.value}
                                onChange={(e) => update(idx, { value: e.target.value })}
                            />
                        )}
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={() => onChange(conditions.filter((_, i) => i !== idx))}
                            title="Usun warunek"
                        >
                            <Trash2 size={14} />
                        </Button>
                    </div>
                );
            })}
            {conditions.length > 0 && (
                <div className="popup-field__hint">
                    Wszystkie warunki musza byc spelnione. Jesli zdarzenie nie przyniesie danego pola
                    (np. Char.State wysyla tylko to, co sie zmienilo), warunek nie jest spelniony.
                </div>
            )}
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
    // The GMCP option stays selected while no package has been picked yet.
    const [gmcpPicker, setGmcpPicker] = useState(false);
    const [conditions, setConditions] = useState<TriggerCondition[]>([]);
    const [flags, setFlags] = useState('');
    const [gmcpMsgType, setGmcpMsgType] = useState('');
    const [macros, setMacros] = useState<UserMacro[]>([]);
    const [meta, setMeta] = useState(automationMetaDraft());

    useEffect(() => {
        setMeta(automationMetaDraft(trigger));
        if (trigger) {
            setTriggerType(trigger.type || 'pattern');
            setPattern(trigger.pattern || '');
            setEvent(trigger.event || '');
            setGmcpPicker(GMCP_EVENT_IDS.has(trigger.event || ''));
            setConditions(trigger.conditions ?? []);
            setFlags(trigger.flags || '');
            setGmcpMsgType(trigger.gmcpMsgType || '');
            setMacros(trigger.macros ? trigger.macros.map(normalizeMacro) : []);
        } else {
            setTriggerType('pattern');
            setPattern('');
            setEvent('');
            setGmcpPicker(false);
            setConditions([]);
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
        if (triggerType === 'event' ? !event : !pattern.trim()) return;
        let entry: UserTrigger;
        if (triggerType === 'event') {
            entry = { ...automationMetaFromDraft(meta, trigger), type: 'event', event, macros };
            if (applicableConditions.length) entry.conditions = applicableConditions;
        } else {
            entry = { ...automationMetaFromDraft(meta, trigger), type: 'pattern', pattern: pattern.trim(), macros };
            if (flags.trim()) {
                entry.flags = flags.trim();
            }
            if (gmcpMsgType.trim()) {
                entry.gmcpMsgType = gmcpMsgType.trim();
            }
        }
        onSave(entry);
    }

    function changeTriggerType(next: TriggerType) {
        setTriggerType(next);
        // Pattern-only actions make no sense on an event; plugin macros are kept.
        if (next === 'event') {
            setMacros(prev => prev.filter(m =>
                LINELESS_MACRO_TYPES.has(m.type) || m.type.startsWith('plugin:')
            ));
        }
    }

    const isValid = triggerType === 'event' ? !!event : !!pattern.trim();

    const selectedEvent =
        triggerType === 'event' ? SUPPORTED_EVENTS.find(e => e.id === event) : undefined;

    // Placeholders offered by the currently selected event. Pattern triggers
    // get none — their macros already fall back to the matched text.
    const selectedEventArgs: EventArg[] = selectedEvent?.args ?? [];

    // Conditions left over from a previously picked event reference fields this
    // one does not carry and could never pass; they are hidden and not saved.
    const applicableConditions = conditions.filter(c => selectedEventArgs.some(a => a.name === c.arg));

    return (
        <Dialog
            title={isEdit ? 'Edytuj trigger' : 'Dodaj trigger'}
            onClose={onClose}
            size="lg"
            className="trigger-edit"
            footer={(
                <>
                    <Button onClick={onClose}>Anuluj</Button>
                    <Button variant="solid" onClick={handleSave} disabled={!isValid}>
                        {isEdit ? 'Zapisz' : 'Dodaj'}
                    </Button>
                </>
            )}
        >
            <div className="popup-stack">
                <AutomationMetaFields value={meta} onChange={setMeta} />

                <Field label="Wyzwalany przez">
                    <Segmented value={triggerType} options={TRIGGER_TYPE_OPTIONS} onChange={changeTriggerType} />
                </Field>

                {triggerType === 'pattern' ? (
                    <>
                        <Field label="Wzorzec">
                            <div className="popup-inline">
                                <Input
                                    mono
                                    placeholder="Pattern"
                                    value={pattern}
                                    onChange={e => setPattern(e.target.value)}
                                />
                                <FlagsPicker value={flags} onChange={setFlags} />
                            </div>
                        </Field>
                        <Field label="Typ wiadomosci" hint="Opcjonalnie — dopasuj tylko wiadomosci danego typu.">
                            <Input
                                mono
                                list="gmcp-msg-types"
                                placeholder="Typ wiadomosci (opcjonalnie)"
                                value={gmcpMsgType}
                                onChange={e => setGmcpMsgType(e.target.value)}
                            />
                            <datalist id="gmcp-msg-types">
                                {GMCP_MSG_TYPES.map(t => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                            </datalist>
                        </Field>
                    </>
                ) : (
                    <Field label="Zdarzenie" hint={selectedEvent?.description}>
                        <Select
                            value={gmcpPicker ? GMCP_GROUP_VALUE : event}
                            onChange={(e) => {
                                const value = e.target.value;
                                setGmcpPicker(value === GMCP_GROUP_VALUE);
                                setEvent(value === GMCP_GROUP_VALUE ? '' : value);
                            }}
                        >
                            <option value="">Wybierz zdarzenie...</option>
                            {(() => {
                                const byCategory = new Map<string, SupportedEvent[]>();
                                for (const ev of SUPPORTED_EVENTS) {
                                    if (ev.category === GMCP_EVENT_CATEGORY) continue;
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
                            <option value={GMCP_GROUP_VALUE}>GMCP</option>
                        </Select>
                        {gmcpPicker && (
                            <Select
                                data-testid="trigger-gmcp-type"
                                value={event}
                                onChange={(e) => setEvent(e.target.value)}
                            >
                                <option value="">Wybierz typ GMCP...</option>
                                {GMCP_EVENTS.map(ev => (
                                    <option key={ev.id} value={ev.id}>{ev.label}</option>
                                ))}
                            </Select>
                        )}
                    </Field>
                )}

                {triggerType === 'event' && selectedEventArgs.length > 0 && (
                    <ConditionsEditor
                        conditions={applicableConditions}
                        onChange={setConditions}
                        args={selectedEventArgs}
                    />
                )}

                <div className="trigger-section">
                    <div className="trigger-section__head">
                        <h3 className="trigger-section__title">Akcje</h3>
                        {macros.length > 0 && <span className="popup-badge">{macros.length}</span>}
                        <Button variant="ghost" size="sm" className="trigger-section__add" onClick={addMacro}>
                            Dodaj akcję
                        </Button>
                    </div>
                    {macros.length > 0 && (
                        <div className="trigger-actions">
                            {macros.map((m, i) => (
                                <MacroEditor
                                    key={i}
                                    macro={m}
                                    onChange={macro => updateMacro(i, macro)}
                                    onRemove={() => removeMacro(i)}
                                    sounds={customSounds}
                                    onRequestSoundUpload={onRequestSoundUpload}
                                    pluginMacros={pluginMacros}
                                    lineless={triggerType === 'event'}
                                    placeholders={selectedEventArgs.map(a => ({ token: `{${a.name}}`, label: a.label }))}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Dialog>
    );
};

export default TriggerEditModal;
