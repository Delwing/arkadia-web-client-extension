import React, { useEffect, useMemo, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { getCurrentRoomId } from '@modules/core/currentRoomProvider';
import type { PersonEntry, PersonListEntry } from '@client/types/people';
import { GUILD_CODES_BY_ID } from '@modules/data/peopleGuilds';
import { makePersonKey } from '@modules/data/peopleLoader';
import { Button, Check, ColorInput, Field, Input, Notice, Select, TextArea } from '@web-ui/primitives';
import { Check as CheckIcon, ChevronLeft, Crosshair, EyeOff, Info, Map as MapIcon, Route, Trash2, X } from 'lucide-react';
import { PersonBadges } from './PersonBadges';
import { PersonLocationMap } from './PersonLocationMap';
import { describeRoom, findNpcLocation, parseRoomId } from './personLocation';

const ALL_GUILD_CODES = Object.values(GUILD_CODES_BY_ID).sort();

/** Only NPCs stay in one place, so only they get a location. */
const LOCATED_GUILD = 'NPC';

export interface PersonNote {
    text: string;
    showOnMeet: boolean;
}

export interface PersonPanelProps {
    mode: 'add' | 'edit';
    person?: PersonListEntry;
    onSave: (entry: PersonEntry, note: PersonNote, location: number | null) => void;
    /** Leaves the panel: back to the list on a narrow window, or drops a new entry being added. */
    onClose: () => void;
    onIgnore: () => void;
    onRestore: () => void;
    onRestoreOriginal: () => void;
    onDelete: () => void;
    onToggleEnemy: () => void;
    onToggleAlly: () => void;
    onSetColor: (color: string) => void;
    onClearColor: () => void;
}

interface Draft {
    name: string;
    description: string;
    guild: string;
    note: string;
    showOnMeet: boolean;
    location: string;
}

function draftOf(mode: 'add' | 'edit', person?: PersonListEntry): Draft {
    if (mode === 'edit' && person) {
        return {
            name: person.name,
            description: person.description,
            guild: person.guild,
            note: person.note ?? '',
            showOnMeet: person.showNoteOnMeet ?? false,
            location: person.location !== undefined ? String(person.location) : '',
        };
    }
    return { name: '', description: '', guild: 'NPC', note: '', showOnMeet: false, location: '' };
}

function sameDraft(a: Draft, b: Draft): boolean {
    return a.name.trim() === b.name.trim()
        && a.description.trim() === b.description.trim()
        && a.guild === b.guild
        && a.note.trim() === b.note.trim()
        && (!a.note.trim() || a.showOnMeet === b.showOnMeet)
        && (a.guild !== LOCATED_GUILD || parseRoomId(a.location) === parseRoomId(b.location));
}

export const PersonPanel: React.FC<PersonPanelProps> = ({
    mode,
    person,
    onSave,
    onClose,
    onIgnore,
    onRestore,
    onRestoreOriginal,
    onDelete,
    onToggleEnemy,
    onToggleAlly,
    onSetColor,
    onClearColor,
}) => {
    const personKey = person ? makePersonKey(person.name, person.description) : '';
    const saved = useMemo(() => draftOf(mode, person),
        // Marks and colours change the entry without touching the draft's fields.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [mode, personKey, person?.guild, person?.note, person?.showNoteOnMeet, person?.location]);
    const [draft, setDraft] = useState<Draft>(saved);
    const [npcLocation, setNpcLocation] = useState<number | null>(null);

    useEffect(() => {
        setDraft(saved);
    }, [saved]);

    const update = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }));

    const isLocated = draft.guild === LOCATED_GUILD;
    useEffect(() => {
        if (!isLocated || !draft.name.trim()) {
            setNpcLocation(null);
            return;
        }
        let cancelled = false;
        findNpcLocation(draft.name).then(loc => {
            if (!cancelled) setNpcLocation(loc);
        });
        return () => {
            cancelled = true;
        };
    }, [isLocated, draft.name]);

    const isIgnored = mode === 'edit' && !!person?.ignored;
    const isLocal = person?.source === 'local';
    const locationId = parseRoomId(draft.location);
    const locationInvalid = isLocated && !!draft.location.trim() && locationId === null;
    const canSave = !!draft.name.trim() && !!draft.description.trim() && !locationInvalid;
    const dirty = !sameDraft(draft, saved);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave || (mode === 'edit' && !dirty)) return;
        onSave(
            { name: draft.name.trim(), description: draft.description.trim(), guild: draft.guild },
            { text: draft.note.trim(), showOnMeet: draft.showOnMeet },
            isLocated ? locationId : null,
        );
    };

    const useCurrentRoom = () => {
        const roomId = getCurrentRoomId();
        if (roomId !== null) update({ location: String(roomId) });
    };

    const back = (
        <button type="button" className="people-panel__back" onClick={onClose}>
            <ChevronLeft size={15} strokeWidth={2} /> Wróć do listy
        </button>
    );

    if (isIgnored && person) {
        return (
            <div className="people-panel">
                {back}
                <div className="people-panel__scroll">
                    <PanelHeader person={person} />
                    <Notice variant="warning">
                        Ta postać jest ignorowana: nie tworzy triggerów. Przywróć ją, aby ją edytować.
                    </Notice>
                </div>
                <div className="people-panel__footer">
                    <span className="people-panel__spacer" />
                    <Button variant="solid" size="sm" onClick={onRestore} title="Przywróć tę postać">
                        Przywróć
                    </Button>
                </div>
            </div>
        );
    }

    const currentRoom = getCurrentRoomId();
    const room = locationId !== null ? describeRoom(locationId) : null;
    const showSuggestion = isLocated && npcLocation !== null && npcLocation !== locationId;

    return (
        <form className="people-panel" onSubmit={handleSubmit}>
            {back}
            <div className="people-panel__scroll">
                {mode === 'edit' && person ? (
                    <PanelHeader person={person} />
                ) : (
                    <div className="people-panel__id">
                        <div className="people-panel__name">Nowa postać</div>
                        <div className="people-panel__desc">Dodana postać jest zapisywana tylko dla tej postaci gracza.</div>
                    </div>
                )}

                <div className="people-panel__cols">
                    <div className="people-panel__col">
                        {mode === 'edit' && person && (
                            <MarksGroup
                                person={person}
                                onToggleEnemy={onToggleEnemy}
                                onToggleAlly={onToggleAlly}
                                onSetColor={onSetColor}
                                onClearColor={onClearColor}
                            />
                        )}

                        <div className="people-panel__group">
                            <span className="people-panel__label">Notatka</span>
                            <TextArea
                                className="people-panel__note"
                                rows={3}
                                value={draft.note}
                                onChange={(e) => update({ note: e.target.value })}
                                placeholder="np. handluje ziołami"
                            />
                            <Check
                                checked={draft.showOnMeet}
                                onChange={(e) => update({ showOnMeet: e.target.checked })}
                                label="Pokaż notatkę przy spotkaniu"
                            />
                        </div>
                    </div>

                    <div className="people-panel__col">
                        {isLocated && (
                            <div className="people-panel__group people-panel__location">
                                <div className="people-panel__group-head">
                                    <span className="people-panel__label">Lokacja</span>
                                    <span className="people-panel__hint">opcjonalna</span>
                                </div>
                                <div className="people-panel__location-row">
                                    <Input
                                        className="people-panel__location-input"
                                        inputMode="numeric"
                                        placeholder="nr lokacji"
                                        value={draft.location}
                                        onChange={(e) => update({ location: e.target.value })}
                                        title="Numer lokacji na mapie"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={useCurrentRoom}
                                        disabled={currentRoom === null}
                                        title="Wstaw lokację, w której stoisz"
                                    >
                                        <Crosshair size={14} strokeWidth={2} /> Tutaj
                                    </Button>
                                    {draft.location && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="popup-btn--icon"
                                            onClick={() => update({ location: '' })}
                                            title="Usuń lokację"
                                        >
                                            <X size={14} strokeWidth={2} />
                                        </Button>
                                    )}
                                </div>
                                {locationInvalid && (
                                    <span className="people-panel__error">Numer lokacji to liczba, np. 1203.</span>
                                )}
                                {showSuggestion && (
                                    <div className="people-panel__suggestion">
                                        <Info size={14} strokeWidth={2} />
                                        <span>
                                            Z bazy NPC: <strong>#{npcLocation}</strong>{' '}
                                            {describeRoom(npcLocation)?.name ?? ''}
                                        </span>
                                        <Button size="sm" onClick={() => update({ location: String(npcLocation) })}>
                                            Użyj
                                        </Button>
                                    </div>
                                )}
                                {locationId !== null ? (
                                    <div className="people-panel__room">
                                        <div className="people-panel__room-name">
                                            <strong>{room?.name ?? 'Nieznana lokacja'}</strong>
                                            <span>{room ? `${room.area} · ` : ''}#{locationId}</span>
                                        </div>
                                        {room && <PersonLocationMap roomId={locationId} />}
                                        <div className="people-panel__room-actions">
                                            <Button size="sm" variant="solid" onClick={() => eventBus.emit('leadTo', locationId)} title="Prowadź do tej lokacji">
                                                <Route size={14} strokeWidth={2} /> Prowadź
                                            </Button>
                                            <Button size="sm" onClick={() => eventBus.emit('map.centerOn', { roomId: locationId })} title="Pokaż lokację na mapie">
                                                <MapIcon size={14} strokeWidth={2} /> Na mapie
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => eventBus.emit('roomInfo.popup.open', { roomId: locationId })} title="Informacje o lokacji">
                                                <Info size={14} strokeWidth={2} /> Info
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="people-panel__room people-panel__room--empty">
                                        Bez lokacji. Wpisz numer albo użyj „Tutaj”.
                                    </div>
                                )}
                            </div>
                        )}

                        {mode === 'edit' && person?.originalEntry && (
                            <div className="people-panel__original">
                                <div>
                                    <span className="people-panel__hint">Zmieniona lokalnie. Oryginał:</span>
                                    <div>
                                        <strong>{person.originalEntry.name}</strong> ({person.originalEntry.guild}) {person.originalEntry.description}
                                    </div>
                                </div>
                                <Button size="sm" onClick={onRestoreOriginal} title="Przywróć oryginalne wartości">
                                    Przywróć
                                </Button>
                            </div>
                        )}

                        <div className="people-panel__group">
                            <span className="people-panel__label">Dane</span>
                            <div className="people-panel__fields">
                                <Field label="Imię" className="people-panel__field-name">
                                    <Input
                                        value={draft.name}
                                        onChange={(e) => update({ name: e.target.value })}
                                        placeholder="np. Eamon"
                                        autoFocus={mode === 'add'}
                                    />
                                </Field>
                                <Field label="Gildia" className="people-panel__field-guild">
                                    <Select value={draft.guild} onChange={(e) => update({ guild: e.target.value })}>
                                        {ALL_GUILD_CODES.map((g) => (
                                            <option key={g} value={g}>{g}</option>
                                        ))}
                                    </Select>
                                </Field>
                                <Field
                                    label="Opis"
                                    hint="Tak, jak gra opisuje postać, zanim się przedstawi."
                                    className="people-panel__field-desc"
                                >
                                    <Input
                                        value={draft.description}
                                        onChange={(e) => update({ description: e.target.value })}
                                        placeholder="np. wysoki mezczyzna"
                                    />
                                </Field>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="people-panel__footer">
                {mode === 'edit' && isLocal && (
                    <Button size="sm" variant="ghost" className="people-panel__delete" onClick={onDelete} title="Usuń tę postać">
                        <Trash2 size={14} strokeWidth={2} /> Usuń
                    </Button>
                )}
                {mode === 'edit' && !isLocal && (
                    <Button size="sm" variant="ghost" className="people-panel__ignore" onClick={onIgnore} title="Ignoruj tę postać (nie twórz triggerów)">
                        <EyeOff size={14} strokeWidth={2} /> Ignoruj
                    </Button>
                )}
                <span className="people-panel__spacer" />
                {mode === 'add' ? (
                    <>
                        <Button size="sm" onClick={onClose}>Anuluj</Button>
                        <Button size="sm" variant="solid" type="submit" disabled={!canSave}>Dodaj</Button>
                    </>
                ) : (
                    <>
                        {dirty && <Button size="sm" onClick={() => setDraft(saved)} title="Cofnij niezapisane zmiany">Anuluj</Button>}
                        <Button size="sm" variant="solid" type="submit" disabled={!dirty || !canSave}>Zapisz</Button>
                    </>
                )}
            </div>
        </form>
    );
};

const PanelHeader: React.FC<{ person: PersonListEntry }> = ({ person }) => {
    const color = person.color && !person.isEnemy ? person.color : undefined;
    return (
        <div className="people-panel__id">
            <div className="people-panel__name">
                <span
                    className={[
                        'people-panel__name-text',
                        person.isEnemy && 'is-enemy',
                        person.isAlly && !person.isEnemy && 'is-ally',
                        person.ignored && 'is-ignored',
                    ].filter(Boolean).join(' ')}
                    style={color ? { color } : undefined}
                >
                    {person.name}
                </span>
                <span className="people-browser__guild">{person.guild}</span>
            </div>
            <div className="people-panel__desc">{person.description}</div>
            <div className="people-panel__badges"><PersonBadges person={person} /></div>
        </div>
    );
};

const MarksGroup: React.FC<{
    person: PersonListEntry;
    onToggleEnemy: () => void;
    onToggleAlly: () => void;
    onSetColor: (color: string) => void;
    onClearColor: () => void;
}> = ({ person, onToggleEnemy, onToggleAlly, onSetColor, onClearColor }) => (
    <div className="people-panel__group">
        <div className="people-panel__group-head">
            <span className="people-panel__label">Oznaczenia</span>
            <span className="people-panel__hint">zapisują się od razu</span>
        </div>
        <div className="people-panel__marks">
            <Button
                size="sm"
                className={person.isEnemy ? 'people-panel__mark--enemy is-active' : 'people-panel__mark--enemy'}
                onClick={onToggleEnemy}
                title={person.isEnemy ? 'Odznacz jako wroga' : 'Oznacz jako wroga'}
            >
                {person.isEnemy && <CheckIcon size={14} strokeWidth={2.5} />}
                Wróg
            </Button>
            <Button
                size="sm"
                className={person.isAlly ? 'people-panel__mark--ally is-active' : 'people-panel__mark--ally'}
                onClick={onToggleAlly}
                title={person.isAlly ? 'Odznacz jako sojusznika' : 'Oznacz jako sojusznika'}
            >
                {person.isAlly && <CheckIcon size={14} strokeWidth={2.5} />}
                Sojusznik
            </Button>
            <span className="people-panel__marks-sep" />
            <label className="people-panel__color-label" title="Kolor indywidualny">
                <ColorInput
                    className="people-panel__color"
                    value={person.color || '#ffff5f'}
                    onChange={v => onSetColor(v)}
                />
                <span>{person.color ? 'własny' : 'gildii'}</span>
            </label>
            {person.color && (
                <Button size="sm" variant="ghost" onClick={onClearColor} title="Usuń indywidualny kolor">
                    Wyczyść
                </Button>
            )}
        </div>
    </div>
);
