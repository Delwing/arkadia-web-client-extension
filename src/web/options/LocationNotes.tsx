import { useEffect, useState, useCallback } from "react";
import { Button, Form, Table } from 'react-bootstrap';
import { Trash2, Pencil } from 'lucide-react';
import eventBus from "@modules/core/eventBus";
import { getAllNotes, deleteNote, type LocationNote } from "./locationNotesStorage";

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

        const query = searchQuery.toLowerCase();
        const filtered = notes.filter(note =>
            note.note.toLowerCase().includes(query) ||
            (note.roomName?.toLowerCase().includes(query)) ||
            (note.areaName?.toLowerCase().includes(query)) ||
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
        <div className="m-2 d-flex flex-column gap-2">
            <Form.Group>
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Szukaj (ID, nazwa lokacji, kraina, tekst notatki)..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </Form.Group>

            {filteredNotes.length === 0 ? (
                <div className="text-muted text-center py-3">
                    {notes.length === 0
                        ? 'Brak notatek. Dodaj notatke klikajac prawym przyciskiem na lokacje na mapie.'
                        : 'Nie znaleziono notatek pasujacych do wyszukiwania.'}
                </div>
            ) : (
                <Table bordered size="sm" hover className="table-modern table-zebra">
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }}>ID</th>
                            <th style={{ width: '150px' }}>Lokacja</th>
                            <th>Notatka</th>
                            <th style={{ width: '140px' }}>Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="align-middle">
                        {filteredNotes.map(note => (
                            <tr key={note.id}>
                                <td>{note.id}</td>
                                <td>
                                    <div className="small">
                                        {note.roomName || '-'}
                                        {note.areaName && (
                                            <div className="text-muted">{note.areaName}</div>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <span title={note.note}>{truncateNote(note.note)}</span>
                                </td>
                                <td>
                                    <div className="d-flex gap-1">
                                        <Button
                                            size="sm"
                                            variant="outline-primary"
                                            onClick={() => handleNavigate(note.id)}
                                            title="Prowadz do lokacji"
                                        >
                                            Idz
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline-secondary"
                                            onClick={() => handleEdit(note)}
                                            title="Edytuj notatke"
                                        >
                                            <Pencil size={16} />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            onClick={() => handleDelete(note.id)}
                                            title="Usun notatke"
                                        >
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            )}

            <div className="text-muted small">
                Liczba notatek: {filteredNotes.length}{searchQuery && ` / ${notes.length}`}
            </div>
        </div>
    );
}

export default LocationNotes;
