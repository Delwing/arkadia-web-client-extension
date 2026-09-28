import { useState } from 'react';
import { Button, DeleteButton, Input, Select } from '@web-ui/primitives/index.ts';
import {
    CONDITION_OPERATORS,
    GMCP_EVENT_CATEGORY,
    SUPPORTED_EVENTS,
    type EventArg,
    type SupportedEvent,
    type TriggerCondition,
} from '@client/scripts/userTriggers';

/**
 * The parts of a trigger's "when": regex flags, the GMCP message type filter,
 * the event picker and the conditions on an event's payload.
 */

export const GMCP_MSG_TYPES: { id: string; label: string }[] = [
    { id: 'combat.avatar', label: 'Walka postaci gracza' },
    { id: 'combat.team', label: 'Walka drużyny' },
    { id: 'combat.others', label: 'Walka innych' },
    { id: 'room.combat', label: 'Opis walki na lokacji' },
    { id: 'comm', label: 'Mówienie/szeptanie/krzyczenie' },
    { id: 'emotes', label: 'Emocje skierowane do gracza' },
    { id: 'room.long', label: 'Długi opis lokacji' },
    { id: 'room.short', label: 'Krótki opis lokacji' },
    { id: 'room.item', label: 'Opisy przedmiotów na lokacji' },
    { id: 'room.exits', label: 'Wyjścia z lokacji' },
    { id: 'room.contents.living', label: 'Istoty żywe na lokacji' },
    { id: 'room.contents.object', label: 'Obiekty na lokacji' },
    { id: 'room.contents', label: 'Nieokreślone obiekty na lokacji' },
    { id: 'living.long', label: 'Długi opis żywej istoty' },
    { id: 'object.long', label: 'Długi opis obiektu' },
    { id: 'system', label: 'Komunikaty systemowe' },
    { id: 'system.login', label: 'Logowanie i konto' },
    { id: 'mail', label: 'Poczta' },
    { id: 'editor.mail', label: 'Edycja listów' },
    { id: 'editor', label: 'Edycja tekstów' },
    { id: 'notification.mail', label: 'Powiadomienia - poczta' },
    { id: 'notification.common', label: 'Powiadomienia - Wieści' },
    { id: 'notification.knowledge', label: 'Powiadomienia - wiedza' },
    { id: 'notification.relations', label: 'Powiadomienia - relacje' },
    { id: 'notification.boards', label: 'Powiadomienia - tablice' },
    { id: 'notification', label: 'Pozostałe powiadomienia' },
    { id: 'prompt', label: 'Znak zachęty terminala' },
    { id: 'other', label: 'Pozostałe komunikaty' },
];

const FLAGS = [
    { flag: 'i', title: 'Ignoruj wielkość liter' },
    { flag: 'g', title: 'Wszystkie wystąpienia' },
    { flag: 'm', title: 'Wieloliniowy' },
];

/** The i / g / m toggles at the end of the pattern field. */
export function FlagToggles({ value, onChange }: { value: string; onChange: (flags: string) => void }) {
    return (
        <span className="automation-flags">
            {FLAGS.map(({ flag, title }) => {
                const on = value.includes(flag);
                return (
                    <button
                        key={flag}
                        type="button"
                        className={`automation-flag${on ? ' is-on' : ''}`}
                        title={title}
                        onClick={() => onChange(on ? value.replace(flag, '') : value + flag)}
                    >
                        {flag}
                    </button>
                );
            })}
        </span>
    );
}

const GMCP_EVENTS = SUPPORTED_EVENTS.filter(e => e.category === GMCP_EVENT_CATEGORY);
const GMCP_EVENT_IDS = new Set(GMCP_EVENTS.map(e => e.id));
/** Value of the single "GMCP" option standing in for all GMCP packages in the event picker. */
const GMCP_GROUP_VALUE = '__gmcp__';

/** Events by category, with the raw GMCP packages behind one "GMCP" choice. */
export function EventPicker({ event, onChange }: { event: string; onChange: (event: string) => void }) {
    // The GMCP option stays selected while no package has been picked yet.
    const [gmcpPicker, setGmcpPicker] = useState(GMCP_EVENT_IDS.has(event));
    const byCategory = new Map<string, SupportedEvent[]>();
    for (const ev of SUPPORTED_EVENTS) {
        if (ev.category === GMCP_EVENT_CATEGORY) continue;
        if (!byCategory.has(ev.category)) byCategory.set(ev.category, []);
        byCategory.get(ev.category)!.push(ev);
    }
    return (
        <div className="automation-event">
            <Select
                title="Zdarzenie"
                value={gmcpPicker || GMCP_EVENT_IDS.has(event) ? GMCP_GROUP_VALUE : event}
                onChange={e => {
                    const value = e.target.value;
                    setGmcpPicker(value === GMCP_GROUP_VALUE);
                    onChange(value === GMCP_GROUP_VALUE ? '' : value);
                }}
            >
                <option value="">Wybierz zdarzenie...</option>
                {Array.from(byCategory.entries()).map(([category, events]) => (
                    <optgroup key={category} label={category}>
                        {events.map(ev => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
                    </optgroup>
                ))}
                <option value={GMCP_GROUP_VALUE}>GMCP</option>
            </Select>
            {(gmcpPicker || GMCP_EVENT_IDS.has(event)) && (
                <Select data-testid="trigger-gmcp-type" title="Typ GMCP" value={event} onChange={e => onChange(e.target.value)}>
                    <option value="">Wybierz typ GMCP...</option>
                    {GMCP_EVENTS.map(ev => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
                </Select>
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
export function ConditionsEditor({
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
                                placeholder="Wartość"
                                value={c.value}
                                onChange={(e) => update(idx, { value: e.target.value })}
                            />
                        )}
                        <DeleteButton
                            onClick={() => onChange(conditions.filter((_, i) => i !== idx))}
                            title="Usuń warunek"
                        />
                    </div>
                );
            })}
            {conditions.length > 0 && (
                <div className="popup-field__hint">
                    Wszystkie warunki muszą być spełnione. Jeśli zdarzenie nie przyniesie danego pola
                    (np. Char.State wysyła tylko to, co się zmieniło), warunek nie jest spełniony.
                </div>
            )}
        </div>
    );
}
