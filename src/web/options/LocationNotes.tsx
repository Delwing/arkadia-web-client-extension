import { useEffect, useState, useCallback } from "react";
import { Pencil } from 'lucide-react';
import { Button, DeleteButton, Input } from "@web-ui/primitives/index.ts";
import eventBus from "@modules/core/eventBus";
import { getAllNotes, deleteNote, type LocationNote } from "./locationNotesStorage";
import { foldText } from "@web/settings/settingsSearch.ts";

function LocationNotes() {
    const [notes, setNotes] = useState<LocationNote[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredNotes, setFilteredNotes] = useState<LocationNote[]>([]);

    const loadNotes = useCallback(async () => {
        const all = await getAllNotes();
        all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setNotes(all);
    }, []);

    useEffect(() => {
        loadNotes();

        const handleVisibilityChange = () => {
            if (!document.hidden) {
                loadNotes();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [loadNotes]);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredNotes(notes);
            return;
        }

        const query = foldText(searchQuery);
        const filtered = notes.filter(note =>
            foldText(note.note).includes(query) ||
            (note.roomName && foldText(note.roomName).includes(query)) ||
            (note.areaName && foldText(note.areaName).includes(query)) ||
            String(note.id).includes(query)
        );
        setFilteredNotes(filtered);
    }, [notes, searchQuery]);

    const handleDelete = async (id: number) => {
        await deleteNote(id);
        await loadNotes();
    };

    const handleEdit = (note: LocationNote) => {
        eventBus.emit('locationNote.edit', {
            roomId: note.id,
            roomName: note.roomName,
            areaName: note.areaName
        });
    };

    const handleNavigate = (id: number) => {
        eventBus.emit('leadTo', id);
        window.dispatchEvent(new Event('close-options'));
    };

    const truncateNote = (text: string, maxLength: number = 50) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    return (
        <div className="popup-stack location-notes-panel">
            <Input
                placeholder="Szukaj (ID, nazwa lokacji, kraina, tekst notatki)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
            />

            {filteredNotes.length === 0 ? (
                <div className="popup-field__hint location-notes-panel__empty">
                    {notes.length === 0
                        ? 'Brak notatek. Dodaj notatkę klikając prawym przyciskiem na lokację na mapie.'
                        : 'Nie znaleziono notatek pasujących do wyszukiwania.'}
                </div>
            ) : (
                <table className="popup-table">
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }}>ID</th>
                            <th style={{ width: '150px' }}>Lokacja</th>
                            <th>Notatka</th>
                            <th style={{ width: '140px' }}>Akcje</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredNotes.map(note => (
                            <tr key={note.id}>
                                <td>{note.id}</td>
                                <td>
                                    {note.roomName || '-'}
                                    {note.areaName && (
                                        <div className="popup-field__hint">{note.areaName}</div>
                                    )}
                                </td>
                                <td>
                                    <span title={note.note}>{truncateNote(note.note)}</span>
                                </td>
                                <td>
                                    <div className="popup-inline">
                                        <Button size="sm" onClick={() => handleNavigate(note.id)} title="Prowadź do lokacji">
                                            Idź
                                        </Button>
                                        <Button size="sm" variant="ghost" className="popup-btn--icon" onClick={() => handleEdit(note)} title="Edytuj notatkę">
                                            <Pencil size={15} strokeWidth={1.75} />
                                        </Button>
                                        <DeleteButton onClick={() => handleDelete(note.id)} title="Usuń notatkę" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <div className="popup-field__hint">
                Liczba notatek: {filteredNotes.length}{searchQuery && ` / ${notes.length}`}
            </div>
        </div>
    );
}

export default LocationNotes;
