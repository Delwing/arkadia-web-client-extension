import React, { useState, useEffect } from 'react';
import type { PersonEntry, PersonListEntry } from '@client/types/people';
import { GUILD_CODES_BY_ID } from '@modules/data/peopleGuilds';

const ALL_GUILD_CODES = Object.values(GUILD_CODES_BY_ID).sort();

export interface PersonEditModalProps {
    show: boolean;
    onClose: () => void;
    onSave: (entry: PersonEntry) => void;
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

    useEffect(() => {
        if (person && mode === 'edit') {
            setName(person.name);
            setDescription(person.description);
            setGuild(person.guild);
        } else {
            setName('');
            setDescription('');
            setGuild('NPC');
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
        });
    };

    const isIgnored = person?.ignored ?? false;
    const hasOriginal = person?.originalEntry !== undefined;
    const isLocallyAdded = person?.source === 'local';
    const isMarkedEnemy = person?.isEnemy ?? false;
    const isMarkedAlly = person?.isAlly ?? false;
    const currentColor = person?.color;

    return (
        <div
            className="modal show d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}
            onClick={onClose}
        >
            <div
                className="modal-dialog modal-dialog-centered"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">
                            {mode === 'add' ? 'Dodaj postac' : 'Edytuj postac'}
                        </h5>
                        <button
                            type="button"
                            className="btn-close"
                            onClick={onClose}
                        />
                    </div>
                    <div className="modal-body">
                        {hasOriginal && person?.originalEntry && (
                            <div className="alert alert-secondary mb-3">
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        <small className="text-muted d-block mb-1">
                                            Oryginalne wartosci:
                                        </small>
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
                                            className="btn btn-sm btn-light"
                                            onClick={onRestoreOriginal}
                                            title="Przywroc oryginalne wartosci"
                                        >
                                            Przywroc
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="mb-3">
                            <label className="form-label">Nazwa</label>
                            <input
                                type="text"
                                className="form-control"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="np. Eamon"
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Opis</label>
                            <input
                                type="text"
                                className="form-control"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="np. wysoki mezczyzna"
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Gildia</label>
                            <select
                                className="form-select"
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

                        {mode === 'edit' && !isIgnored && (
                            <div className="mb-3">
                                <label className="form-label">Kolor indywidualny</label>
                                <div className="d-flex gap-2 align-items-center">
                                    <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={currentColor || '#ffff5f'}
                                        onChange={(e) => onSetColor?.(e.target.value)}
                                        title="Wybierz kolor"
                                        style={{
                                            border: '2px solid #555',
                                            padding: '2px',
                                            backgroundColor: currentColor || '#ffff5f'
                                        }}
                                    />
                                    {currentColor && onClearColor && (
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-light"
                                            onClick={onClearColor}
                                            title="Usun indywidualny kolor"
                                        >
                                            Wyczysc
                                        </button>
                                    )}
                                    {!currentColor && (
                                        <span className="text-muted small">Brak (uzyje koloru gildii)</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <div className="d-flex w-100 justify-content-between">
                            <div className="d-flex gap-2">
                                {mode === 'edit' && !isIgnored && !isMarkedEnemy && onMarkEnemy && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-danger"
                                        onClick={onMarkEnemy}
                                        title="Oznacz jako wroga"
                                    >
                                        Wrog
                                    </button>
                                )}
                                {mode === 'edit' && !isIgnored && isMarkedEnemy && onUnmarkEnemy && (
                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        onClick={onUnmarkEnemy}
                                        title="Odznacz jako wroga"
                                    >
                                        Wrog
                                    </button>
                                )}
                                {mode === 'edit' && !isIgnored && !isMarkedAlly && onMarkAlly && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-success"
                                        onClick={onMarkAlly}
                                        title="Oznacz jako sojusznika"
                                    >
                                        Sojusznik
                                    </button>
                                )}
                                {mode === 'edit' && !isIgnored && isMarkedAlly && onUnmarkAlly && (
                                    <button
                                        type="button"
                                        className="btn btn-success"
                                        onClick={onUnmarkAlly}
                                        title="Odznacz jako sojusznika"
                                    >
                                        Sojusznik
                                    </button>
                                )}
                                {mode === 'edit' && !isIgnored && !isLocallyAdded && onIgnore && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-warning"
                                        onClick={onIgnore}
                                        title="Ignoruj ta postac (nie tworz triggerow)"
                                    >
                                        Ignoruj
                                    </button>
                                )}
                                {mode === 'edit' && isIgnored && onRestore && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-success"
                                        onClick={onRestore}
                                        title="Przywroc ta postac"
                                    >
                                        Przywroc
                                    </button>
                                )}
                                {mode === 'edit' && isLocallyAdded && onDelete && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-danger"
                                        onClick={onDelete}
                                        title="Usun ta postac"
                                    >
                                        Usun
                                    </button>
                                )}
                            </div>
                            <div className="d-flex gap-2">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={onClose}
                                >
                                    Anuluj
                                </button>
                                {!isIgnored && (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleSave}
                                        disabled={!name.trim() || !description.trim()}
                                    >
                                        Zapisz
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PersonEditModal;
