import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PersonEntry, PersonListEntry } from '@client/types/people';
import { GUILD_CODES_BY_ID } from '@modules/data/peopleGuilds';
import { Check as CheckIcon } from 'lucide-react';
import { Button, Check, Dialog, Field, Input, Notice, Select, TextArea } from '@web-ui/primitives';

const ALL_GUILD_CODES = Object.values(GUILD_CODES_BY_ID).sort();

const FORM_ID = 'people-modal-form';

export interface PersonNote {
    text: string;
    showOnMeet: boolean;
}

export interface PersonEditModalProps {
    show: boolean;
    onClose: () => void;
    onSave: (entry: PersonEntry, note: PersonNote) => void;
    onIgnore?: () => void;
    onRestore?: () => void;
    onRestoreOriginal?: () => void;
    onDelete?: () => void;
    onMarkEnemy?: () => void;
    onUnmarkEnemy?: () => void;
    onMarkAlly?: () => void;
    onUnmarkAlly?: () => void;
    onSetColor?: (color: string) => void;
    onClearColor?: () => void;
    person?: PersonListEntry;
    mode: 'add' | 'edit';
}

const PersonEditModal: React.FC<PersonEditModalProps> = ({
    show,
    onClose,
    onSave,
    onIgnore,
    onRestore,
    onRestoreOriginal,
    onDelete,
    onMarkEnemy,
    onUnmarkEnemy,
    onMarkAlly,
    onUnmarkAlly,
    onSetColor,
    onClearColor,
    person,
    mode,
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [guild, setGuild] = useState('NPC');
    const [note, setNote] = useState('');
    const [showNoteOnMeet, setShowNoteOnMeet] = useState(false);

    useEffect(() => {
        if (person && mode === 'edit') {
            setName(person.name);
            setDescription(person.description);
            setGuild(person.guild);
            setNote(person.note ?? '');
            setShowNoteOnMeet(person.showNoteOnMeet ?? false);
        } else {
            setName('');
            setDescription('');
            setGuild('NPC');
            setNote('');
            setShowNoteOnMeet(false);
        }
    }, [person, mode, show]);

    if (!show) {
        return null;
    }

    const handleSave = () => {
        if (!name.trim() || !description.trim()) {
            return;
        }
        onSave({
            name: name.trim(),
            description: description.trim(),
            guild,
        }, { text: note.trim(), showOnMeet: showNoteOnMeet });
    };

    const isIgnored = person?.ignored ?? false;
    const hasOriginal = person?.originalEntry !== undefined;
    const isLocallyAdded = person?.source === 'local';
    const isMarkedEnemy = person?.isEnemy ?? false;
    const isMarkedAlly = person?.isAlly ?? false;
    const currentColor = person?.color;
    const isEditing = mode === 'edit' && !isIgnored;
    const canSave = !!name.trim() && !!description.trim();

    const footer = (
        <>
            {mode === 'edit' && isIgnored && onRestore && (
                <Button className="people-modal__mark--ally" onClick={onRestore} title="Przywróć tę postać">
                    Przywróć
                </Button>
            )}
            {isEditing && !isLocallyAdded && onIgnore && (
                <Button
                    variant="ghost"
                    className="people-modal__mark--warning"
                    onClick={onIgnore}
                    title="Ignoruj tę postać (nie twórz triggerów)"
                >
                    Ignoruj
                </Button>
            )}
            {mode === 'edit' && isLocallyAdded && onDelete && (
                <Button variant="danger" onClick={onDelete} title="Usuń tę postać">
                    Usuń
                </Button>
            )}
            <span className="people-modal__footer-spacer" />
            <Button onClick={onClose}>Anuluj</Button>
            {!isIgnored && (
                <Button variant="solid" type="submit" form={FORM_ID} disabled={!canSave}>
                    Zapisz
                </Button>
            )}
        </>
    );

    // Portaled to <body>: the dialog must cover the viewport, not the popup body it
    // is declared in — an alternative UI (forge) puts a `filter` on the popup body,
    // which would otherwise trap a `position: fixed` child inside the panel.
    // `data-popup-overlay` is the shared opt-out that keeps clicking the dialog from
    // closing the popup underneath it (see useDockablePopup's outside-click guard).
    return createPortal(
        <div data-popup-overlay>
            <Dialog
                title={mode === 'add' ? 'Dodaj postać' : `Edytuj postać${person ? `: ${person.name}` : ''}`}
                onClose={onClose}
                className="people-modal"
                footer={footer}
            >
                <form
                    id={FORM_ID}
                    className="people-modal__form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSave();
                    }}
                >
                    {isIgnored && (
                        <Notice variant="warning">
                            Ta postać jest ignorowana: nie tworzy triggerów. Przywróć ją, aby ją edytować.
                        </Notice>
                    )}

                    {hasOriginal && person?.originalEntry && (
                        <div className="people-modal__original">
                            <div>
                                <span className="people-modal__hint">Zmieniona lokalnie. Oryginał:</span>
                                <div>
                                    <strong>{person.originalEntry.name}</strong> ({person.originalEntry.guild}) {person.originalEntry.description}
                                </div>
                            </div>
                            {onRestoreOriginal && (
                                <Button size="sm" onClick={onRestoreOriginal} title="Przywróć oryginalne wartości">
                                    Przywróć oryginał
                                </Button>
                            )}
                        </div>
                    )}

                    <div className="people-modal__row">
                        <Field label="Imię" className="people-modal__name">
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="np. Eamon"
                                disabled={isIgnored}
                                autoFocus={mode === 'add'}
                            />
                        </Field>
                        <Field label="Gildia" className="people-modal__guild">
                            <Select value={guild} onChange={(e) => setGuild(e.target.value)} disabled={isIgnored}>
                                {ALL_GUILD_CODES.map((g) => (
                                    <option key={g} value={g}>
                                        {g}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>

                    <Field label="Opis" hint="Tak, jak gra opisuje postać, zanim się przedstawi.">
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="np. wysoki mezczyzna"
                            disabled={isIgnored}
                        />
                    </Field>

                    {!isIgnored && (
                        <Field label="Notatka">
                            <TextArea
                                className="people-modal__note"
                                rows={3}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="np. handluje ziołami"
                            />
                            <Check
                                checked={showNoteOnMeet}
                                onChange={(e) => setShowNoteOnMeet(e.target.checked)}
                                label="Pokaż notatkę przy spotkaniu"
                            />
                        </Field>
                    )}

                    {isEditing && (
                        <div className="people-modal__marks">
                            <div className="people-modal__marks-head">
                                <span className="popup-field__label">Oznaczenia</span>
                                <span className="people-modal__hint">zapisują się od razu</span>
                            </div>
                            <div className="people-modal__marks-row">
                                <Button
                                    className={isMarkedEnemy ? 'people-modal__mark--enemy is-active' : 'people-modal__mark--enemy'}
                                    onClick={isMarkedEnemy ? onUnmarkEnemy : onMarkEnemy}
                                    title={isMarkedEnemy ? 'Odznacz jako wroga' : 'Oznacz jako wroga'}
                                >
                                    {isMarkedEnemy && <CheckIcon size={14} strokeWidth={2.5} />}
                                    Wróg
                                </Button>
                                <Button
                                    className={isMarkedAlly ? 'people-modal__mark--ally is-active' : 'people-modal__mark--ally'}
                                    onClick={isMarkedAlly ? onUnmarkAlly : onMarkAlly}
                                    title={isMarkedAlly ? 'Odznacz jako sojusznika' : 'Oznacz jako sojusznika'}
                                >
                                    {isMarkedAlly && <CheckIcon size={14} strokeWidth={2.5} />}
                                    Sojusznik
                                </Button>
                                <span className="people-modal__marks-sep" />
                                <label className="people-modal__color-label" title="Kolor indywidualny">
                                    <input
                                        type="color"
                                        className="people-modal__color"
                                        value={currentColor || '#ffff5f'}
                                        onChange={(e) => onSetColor?.(e.target.value)}
                                    />
                                    <span>{currentColor ? 'Kolor własny' : 'Kolor gildii'}</span>
                                </label>
                                {currentColor && onClearColor && (
                                    <Button size="sm" variant="ghost" onClick={onClearColor} title="Usuń indywidualny kolor">
                                        Wyczyść
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </form>
            </Dialog>
        </div>,
        document.body,
    );
};

export default PersonEditModal;
