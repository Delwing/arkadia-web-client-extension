import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { CustomSound } from '@modules/core/customSounds';
import {
    isTriggerMacroAvailable,
    type PluginTriggerMacro,
} from '@modules/core/pluginTriggerMacroRegistry';
import { Button, Check, Dialog, Field, Input, Segmented, Select } from '@web-ui/primitives/index.ts';
import { usePopover } from '@web/layout/hooks/usePopover.ts';
import type { UserTrigger, UserMacro, TriggerType, DimEasing, SupportedEvent, EventArg, TriggerCondition } from './UserTriggers';
import { SUPPORTED_EVENTS, GMCP_MSG_TYPES, GMCP_EVENT_CATEGORY, CONDITION_OPERATORS } from './UserTriggers';

const GMCP_EVENTS = SUPPORTED_EVENTS.filter(e => e.category === GMCP_EVENT_CATEGORY);
const GMCP_EVENT_IDS = new Set(GMCP_EVENTS.map(e => e.id));
/** Value of the single "GMCP" option standing in for all GMCP packages in the event picker. */
const GMCP_GROUP_VALUE = '__gmcp__';

const EVENT_COMPATIBLE_MACROS: Set<string> = new Set(['beep', 'mute', 'unmute', 'command', 'functionalBind', 'notify', 'push', 'speak']);

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

function normalizeMacro(macro: UserMacro): UserMacro {
    if (macro.type === 'beep' && (!macro.soundKey || typeof macro.soundKey !== 'string')) {
        return { ...macro, soundKey: 'beep' };
    }
    return macro;
}

/**
 * The placeholders an event offers, as buttons that append `{name}` to a field.
 *
 * Appending rather than inserting at the caret on purpose: the caret position
 * is lost the moment the button takes focus, and restoring it reliably across
 * every field type is more machinery than this earns.
 */
function EventArgChips({
    args,
    onInsert,
}: {
    args: EventArg[];
    onInsert: (token: string) => void;
}) {
    if (args.length === 0) return null;
    return (
        <div className="trigger-arg-chips">
            <span className="popup-field__hint">Wstaw:</span>
            {args.map(arg => (
                <button
                    key={arg.name}
                    type="button"
                    className="popup-btn popup-btn--sm trigger-arg-chips__chip"
                    title={arg.label}
                    onClick={() => onInsert(`{${arg.name}}`)}
                >
                    {`{${arg.name}}`}
                </button>
            ))}
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

function MacroEditor({
    macro,
    onChange,
    onRemove,
    sounds,
    onRequestSoundUpload,
    pluginMacros,
    isEventTrigger = false,
    eventArgs = [],
}: {
    macro: UserMacro;
    onChange: (m: UserMacro) => void;
    onRemove: () => void;
    sounds: CustomSound[];
    onRequestSoundUpload: () => Promise<string | undefined>;
    pluginMacros: PluginTriggerMacro[];
    isEventTrigger?: boolean;
    /** Placeholders the selected event offers. Empty for pattern triggers. */
    eventArgs?: EventArg[];
}) {
    const notificationsSupported = typeof Notification !== 'undefined';
    const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
        notificationsSupported ? Notification.permission : 'unsupported'
    );

    const requestNotificationPermission = async () => {
        if (!notificationsSupported) return;
        try {
            setNotifPermission(await Notification.requestPermission());
        } catch {
            setNotifPermission(Notification.permission);
        }
    };

    const available = isTriggerMacroAvailable(macro.type);

    return (
        <div className="trigger-action">
            <div className="trigger-action__main">
                <Select
                    value={macro.type}
                    className={available ? undefined : 'is-warning'}
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
                    <option value="notify">Powiadomienie</option>
                    <option value="push">Powiadomienie na telefon</option>
                    <option value="speak">Czytaj na glos</option>
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
                    {macro.type.startsWith('plugin:') && !available && (
                        <option value={macro.type} disabled>
                            {macro.type} (wtyczka niedostepna)
                        </option>
                    )}
                </Select>
                {!available && (
                    <div className="popup-field__warning">
                        Ta wtyczka nie jest zaladowana. Makro nie bedzie dzialac.
                    </div>
                )}
                {macro.type === 'beep' && (
                    <Select
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
                    </Select>
                )}
                {macro.type === 'command' && (
                    <>
                        <Input
                            mono
                            placeholder="Command"
                            value={macro.command || ''}
                            onChange={e => onChange({ ...macro, command: e.target.value })}
                        />
                        <EventArgChips
                            args={eventArgs}
                            onInsert={(token) => onChange({ ...macro, command: (macro.command ?? '') + token })}
                        />
                    </>
                )}
                {macro.type === 'push' && (
                    <>
                        <Input
                            mono
                            placeholder={isEventTrigger ? 'Tresc powiadomienia' : 'Tresc powiadomienia (puste = dopasowany tekst)'}
                            value={macro.message || ''}
                            onChange={e => onChange({ ...macro, message: e.target.value })}
                        />
                        <EventArgChips
                            args={eventArgs}
                            onInsert={(token) => onChange({ ...macro, message: (macro.message ?? '') + token })}
                        />
                        <Check
                            label="Wysylaj zawsze (pomin limit raz na minute)"
                            checked={!!macro.bypassCooldown}
                            onChange={e => onChange({ ...macro, bypassCooldown: e.target.checked })}
                        />
                        <div className="popup-field__hint">
                            Wysylane na sparowane urzadzenia niezaleznie od tego, czy patrzysz na klienta.
                            Domyslnie nie czesciej niz raz na minute — zaznacz powyzej dla alertow, ktorych
                            nie chcesz stracic przez wczesniejsze powiadomienie. Wymaga sparowania
                            w Ustawieniach interfejsu → Powiadomienia.
                        </div>
                    </>
                )}
                {macro.type === 'speak' && (
                    <>
                        <Input
                            placeholder={isEventTrigger ? 'Tekst do przeczytania' : 'Tekst do przeczytania (puste = dopasowany tekst)'}
                            value={macro.message || ''}
                            onChange={e => onChange({ ...macro, message: e.target.value })}
                        />
                        <EventArgChips
                            args={eventArgs}
                            onInsert={(token) => onChange({ ...macro, message: (macro.message ?? '') + token })}
                        />
                        <div className="popup-field__hint">
                            {isEventTrigger
                                ? 'Czytane glosem syntezatora mowy.'
                                : <>Czytane glosem syntezatora mowy. <code>{'{1}'}</code>, <code>{'{2}'}</code>… wstawiaja grupy z wzorca (np. <code>{'Atakuje cie (.+)!'}</code> → <code>{'Atak: {1}'}</code>).</>}
                            {' '}Glos, tempo i glosnosc ustawisz w Ustawieniach interfejsu → Dzwiek i powiadomienia.
                        </div>
                    </>
                )}
                {macro.type === 'notify' && (
                    <>
                        <Input
                            mono
                            placeholder={isEventTrigger ? 'Tresc powiadomienia' : 'Tresc powiadomienia (puste = dopasowany tekst)'}
                            value={macro.message || ''}
                            onChange={e => onChange({ ...macro, message: e.target.value })}
                        />
                        <EventArgChips
                            args={eventArgs}
                            onInsert={(token) => onChange({ ...macro, message: (macro.message ?? '') + token })}
                        />
                        {notifPermission !== 'granted' && (
                            <div className="popup-field__warning">
                                {notifPermission === 'unsupported'
                                    ? 'Powiadomienia systemowe nie sa obslugiwane w tej przegladarce. Powiadomienie pojawi sie tylko w kliencie.'
                                    : notifPermission === 'denied'
                                        ? 'Powiadomienia systemowe sa zablokowane w przegladarce. Powiadomienie pojawi sie tylko w kliencie.'
                                        : (
                                            <>
                                                Powiadomienia systemowe sa wylaczone - powiadomienie pojawi sie tylko w kliencie.{' '}
                                                <button type="button" className="popup-link" onClick={requestNotificationPermission}>
                                                    Wlacz powiadomienia systemowe
                                                </button>
                                            </>
                                        )}
                            </div>
                        )}
                    </>
                )}
                {macro.type === 'functionalBind' && (
                    <>
                        <Input
                            mono
                            placeholder="Label (np. 'zabij cel')"
                            value={macro.label || ''}
                            onChange={e => onChange({ ...macro, label: e.target.value })}
                        />
                        <EventArgChips
                            args={eventArgs}
                            onInsert={(token) => onChange({ ...macro, label: (macro.label ?? '') + token })}
                        />
                        <Input
                            mono
                            placeholder="Command (np. 'zabij cel')"
                            value={macro.command || ''}
                            onChange={e => onChange({ ...macro, command: e.target.value })}
                        />
                        <EventArgChips
                            args={eventArgs}
                            onInsert={(token) => onChange({ ...macro, command: (macro.command ?? '') + token })}
                        />
                    </>
                )}
                {macro.type === 'dim' && (
                    <div className="trigger-action__grid">
                        <Field label="Jasnosc poczatkowa">
                            <Input
                                type="number"
                                min={0}
                                max={1}
                                step={0.1}
                                value={macro.dimStartOpacity ?? 1}
                                onChange={e => onChange({ ...macro, dimStartOpacity: parseFloat(e.target.value) })}
                            />
                        </Field>
                        <Field label="Jasnosc koncowa">
                            <Input
                                type="number"
                                min={0}
                                max={1}
                                step={0.1}
                                value={macro.dimEndOpacity ?? 0.3}
                                onChange={e => onChange({ ...macro, dimEndOpacity: parseFloat(e.target.value) })}
                            />
                        </Field>
                        <Field label="Czas (ms)">
                            <Input
                                type="number"
                                min={100}
                                step={100}
                                value={macro.dimDuration ?? 1000}
                                onChange={e => onChange({ ...macro, dimDuration: parseInt(e.target.value, 10) })}
                            />
                        </Field>
                        <Field label="Przejscie">
                            <Select
                                value={macro.dimEasing ?? 'ease-in-out'}
                                onChange={e => onChange({ ...macro, dimEasing: e.target.value as DimEasing })}
                            >
                                <option value="linear">Liniowe</option>
                                <option value="ease">Ease</option>
                                <option value="ease-in">Ease In</option>
                                <option value="ease-out">Ease Out</option>
                                <option value="ease-in-out">Ease In-Out</option>
                            </Select>
                        </Field>
                    </div>
                )}
                {macro.type === 'wrap' && (
                    <>
                        <Input
                            mono
                            placeholder="Prefix"
                            value={macro.wrapPrefix || ''}
                            onChange={e => onChange({ ...macro, wrapPrefix: e.target.value })}
                        />
                        <Input
                            mono
                            placeholder="Suffix"
                            value={macro.wrapSuffix || ''}
                            onChange={e => onChange({ ...macro, wrapSuffix: e.target.value })}
                        />
                        <Select
                            value={macro.wrapScope || 'match'}
                            onChange={e => onChange({ ...macro, wrapScope: e.target.value as 'match' | 'line' })}
                        >
                            <option value="match">Dopasowanie</option>
                            <option value="line">Cala linia</option>
                        </Select>
                    </>
                )}
                {macro.type.startsWith('plugin:') && (() => {
                    const pluginMacro = pluginMacros.find(pm => pm.id === macro.type);
                    if (!pluginMacro?.configFields?.length) return null;
                    const config = macro.pluginConfig || {};
                    return pluginMacro.configFields.map(field => (
                        <React.Fragment key={field.name}>
                            {field.type === 'text' && (
                                <Input
                                    placeholder={field.label}
                                    value={config[field.name] ?? field.defaultValue ?? ''}
                                    onChange={e => onChange({
                                        ...macro,
                                        pluginConfig: { ...config, [field.name]: e.target.value }
                                    })}
                                />
                            )}
                            {field.type === 'number' && (
                                <Input
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
                                <Select
                                    value={config[field.name] ?? field.defaultValue ?? ''}
                                    onChange={e => onChange({
                                        ...macro,
                                        pluginConfig: { ...config, [field.name]: e.target.value }
                                    })}
                                >
                                    {field.options.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </Select>
                            )}
                        </React.Fragment>
                    ));
                })()}
            </div>
            {macro.type === 'color' && (
                <input
                    type="color"
                    className="trigger-action__color"
                    value={macro.color || '#ffffff'}
                    onChange={e => onChange({ ...macro, color: e.target.value })}
                    title="Kolor"
                />
            )}
            {macro.type === 'replace' && (
                <Input
                    mono
                    className="trigger-action__replace"
                    placeholder="Replacement"
                    value={macro.to || ''}
                    onChange={e => onChange({ ...macro, to: e.target.value })}
                />
            )}
            <Button variant="danger" size="sm" onClick={onRemove} title="Usun akcje">
                <Trash2 size={14} />
            </Button>
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

    useEffect(() => {
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
        let entry: UserTrigger;
        if (triggerType === 'event') {
            if (!event) return;
            entry = { type: 'event', event, macros };
            if (applicableConditions.length) entry.conditions = applicableConditions;
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

    function changeTriggerType(next: TriggerType) {
        setTriggerType(next);
        // Pattern-only actions make no sense on an event; plugin macros are kept.
        if (next === 'event') {
            setMacros(prev => prev.filter(m =>
                EVENT_COMPATIBLE_MACROS.has(m.type) || m.type.startsWith('plugin:')
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
                                    isEventTrigger={triggerType === 'event'}
                                    eventArgs={selectedEventArgs}
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
