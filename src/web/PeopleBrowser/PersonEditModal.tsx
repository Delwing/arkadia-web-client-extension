import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PersonEntry, PersonListEntry } from '@client/types/people';
import { GUILD_CODES_BY_ID } from '@modules/data/peopleGuilds';

const ALL_GUILD_CODES = Object.values(GUILD_CODES_BY_ID).sort();

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

    // Portaled to <body>: the modal must cover the viewport, not the popup body it
    // is declared in — an alternative UI (forge) puts a `filter` on the popup body,
    // which would otherwise trap a `position: fixed` child inside the panel.
    // `data-popup-overlay` is the shared opt-out that keeps clicking the modal from
    // closing the popup underneath it (see useDockablePopup's outside-click guard).
    return createPortal(
        <div className="people-modal" data-popup-overlay onClick={onClose}>
            <div
                className="people-modal__dialog"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="people-modal__header">
                    <h5 className="people-modal__title">
                        {mode === 'add' ? 'Dodaj postać' : 'Edytuj postać'}
                    </h5>
                    <button
                        type="button"
                        className="people-modal__close"
                        onClick={onClose}
                        title="Zamknij"
                    >
                        &times;
                    </button>
                </div>
                <div className="people-modal__body">
                    {hasOriginal && person?.originalEntry && (
                        <div className="people-modal__original">
                            <div>
                                <span className="people-modal__hint">Oryginalne wartości:</span>
                                <div>
                                    <strong>Nazwa:</strong> {person.originalEntry.name}
                                </div>
                                <div>
                                    <strong>Opis:</strong> {person.originalEntry.description}
                                </div>
                                <div>
                                    <strong>Gildia:</strong> {person.originalEntry.guild}
                                </div>
                            </div>
                            {onRestoreOriginal && (
                                <button
                                    type="button"
                                    className="popup-btn"
                                    onClick={onRestoreOriginal}
                                    title="Przywróć oryginalne wartości"
                                >
                                    Przywróć
                                </button>
                            )}
                        </div>
                    )}

                    <div className="people-modal__field">
                        <label className="people-modal__label">Nazwa</label>
                        <input
                            type="text"
                            className="popup-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="np. Eamon"
                        />
                    </div>

                    <div className="people-modal__field">
                        <label className="people-modal__label">Opis</label>
                        <input
                            type="text"
                            className="popup-input"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="np. wysoki mezczyzna"
                        />
                    </div>

                    <div className="people-modal__field">
                        <label className="people-modal__label">Gildia</label>
                        <select
                            className="popup-input"
                            value={guild}
                            onChange={(e) => setGuild(e.target.value)}
                        >
                            {ALL_GUILD_CODES.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                    </div>

                    {!isIgnored && (
                        <div className="people-modal__field">
                            <label className="people-modal__label">Notatka</label>
                            <textarea
                                className="popup-input people-modal__note"
                                rows={3}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="np. handluje ziołami, zna drogę do Ishtaru"
                            />
                            <label className="popup-check">
                                <input
                                    type="checkbox"
                                    checked={showNoteOnMeet}
                                    onChange={(e) => setShowNoteOnMeet(e.target.checked)}
                                />
                                <span>Pokaż notatkę przy spotkaniu</span>
                            </label>
                        </div>
                    )}

                    {mode === 'edit' && !isIgnored && (
                        <div className="people-modal__field">
                            <label className="people-modal__label">Kolor indywidualny</label>
                            <div className="people-modal__color-row">
                                <input
                                    type="color"
                                    className="people-modal__color"
                                    value={currentColor || '#ffff5f'}
                                    onChange={(e) => onSetColor?.(e.target.value)}
                                    title="Wybierz kolor"
                                />
                                {currentColor && onClearColor && (
                                    <button
                                        type="button"
                                        className="popup-btn"
                                        onClick={onClearColor}
                                        title="Usuń indywidualny kolor"
                                    >
                                        Wyczyść
                                    </button>
                                )}
                                {!currentColor && (
                                    <span className="people-modal__hint">Brak (użyje koloru gildii)</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="people-modal__footer">
                    <div className="people-modal__footer-group">
                        {mode === 'edit' && !isIgnored && !isMarkedEnemy && onMarkEnemy && (
                            <button
                                type="button"
                                className="popup-btn popup-btn--md people-modal__btn--danger-outline"
                                onClick={onMarkEnemy}
                                title="Oznacz jako wroga"
                            >
                                Wróg
                            </button>
                        )}
                        {mode === 'edit' && !isIgnored && isMarkedEnemy && onUnmarkEnemy && (
                            <button
                                type="button"
                                className="popup-btn popup-btn--md popup-btn--danger"
                                onClick={onUnmarkEnemy}
                                title="Odznacz jako wroga"
                            >
                                Wróg
                            </button>
                        )}
                        {mode === 'edit' && !isIgnored && !isMarkedAlly && onMarkAlly && (
                            <button
                                type="button"
                                className="popup-btn popup-btn--md people-modal__btn--success-outline"
                                onClick={onMarkAlly}
                                title="Oznacz jako sojusznika"
                            >
                                Sojusznik
                            </button>
                        )}
                        {mode === 'edit' && !isIgnored && isMarkedAlly && onUnmarkAlly && (
                            <button
                                type="button"
                                className="popup-btn popup-btn--md popup-btn--success"
                                onClick={onUnmarkAlly}
                                title="Odznacz jako sojusznika"
                            >
                                Sojusznik
                            </button>
                        )}
                        {mode === 'edit' && !isIgnored && !isLocallyAdded && onIgnore && (
                            <button
                                type="button"
                                className="popup-btn popup-btn--md people-modal__btn--warning-outline"
                                onClick={onIgnore}
                                title="Ignoruj tę postać (nie twórz triggerów)"
                            >
                                Ignoruj
                            </button>
                        )}
                        {mode === 'edit' && isIgnored && onRestore && (
                            <button
                                type="button"
                                className="popup-btn popup-btn--md people-modal__btn--success-outline"
                                onClick={onRestore}
                                title="Przywróć tę postać"
                            >
                                Przywróć
                            </button>
                        )}
                        {mode === 'edit' && isLocallyAdded && onDelete && (
                            <button
                                type="button"
                                className="popup-btn popup-btn--md people-modal__btn--danger-outline"
                                onClick={onDelete}
                                title="Usuń tę postać"
                            >
                                Usuń
                            </button>
                        )}
                    </div>
                    <div className="people-modal__footer-group">
                        <button
                            type="button"
                            className="popup-btn popup-btn--md"
                            onClick={onClose}
                        >
                            Anuluj
                        </button>
                        {!isIgnored && (
                            <button
                                type="button"
                                className="popup-btn popup-btn--md popup-btn--primary"
                                onClick={handleSave}
                                disabled={!name.trim() || !description.trim()}
                            >
                                Zapisz
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default PersonEditModal;
