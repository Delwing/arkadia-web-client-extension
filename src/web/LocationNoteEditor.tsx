import { useEffect, useState, useRef, useCallback } from "react";
import { Button, Form, Modal } from 'react-bootstrap';
import eventBus from "@modules/core/eventBus";
import type { ClientEvents } from "@modules/core/eventBus";
import { getNote, saveNote, deleteNote, type LocationNote } from "./options/locationNotesStorage";
import { getPluginLocationNotes, type PluginLocationNote } from "@modules/core/pluginLocationNotesRegistry";
import { getRoomInfo } from "@modules/core/roomInfoProvider";

function LocationNoteEditor() {
    const [show, setShow] = useState(false);
    const [roomId, setRoomId] = useState<number | null>(null);
    const [roomName, setRoomName] = useState<string>('');
    const [areaName, setAreaName] = useState<string>('');
    const [noteText, setNoteText] = useState('');
    const [originalNote, setOriginalNote] = useState('');
    const [pluginNotes, setPluginNotes] = useState<PluginLocationNote[]>([]);
    const [mapNote, setMapNote] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const loadNote = useCallback(async (id: number) => {
        const note = await getNote(id);
        if (note) {
            setNoteText(note.note);
            setOriginalNote(note.note);
            if (note.roomName) setRoomName(note.roomName);
            if (note.areaName) setAreaName(note.areaName);
        } else {
            setNoteText('');
            setOriginalNote('');
        }
        setPluginNotes(getPluginLocationNotes(id));
    }, []);

    const lookupRoomInfo = useCallback((id: number) => {
        return getRoomInfo(id) ?? { roomName: '', areaName: '', mapNote: null };
    }, []);

    useEffect(() => {
        const handleEdit = async ({ roomId: id, roomName: rn, areaName: an }: ClientEvents['locationNote.edit']) => {
            setRoomId(id);

            const info = lookupRoomInfo(id);
            setRoomName(rn || info.roomName);
            setAreaName(an || info.areaName);
            setMapNote(info.mapNote);

            try {
                await loadNote(id);
            } finally {
                setShow(true);
            }
        };

        const handleOpen = async ({ roomId: id }: ClientEvents['locationNote.open']) => {
            setRoomId(id);

            const info = lookupRoomInfo(id);
            setRoomName(info.roomName);
            setAreaName(info.areaName);
            setMapNote(info.mapNote);

            try {
                await loadNote(id);
            } finally {
                setShow(true);
            }
        };

        const unsubEdit = eventBus.on('locationNote.edit', handleEdit);
        const unsubOpen = eventBus.on('locationNote.open', handleOpen);

        return () => {
            unsubEdit();
            unsubOpen();
        };
    }, [loadNote, lookupRoomInfo]);

    useEffect(() => {
        if (show && textareaRef.current) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [show]);

    const handleSave = async () => {
        if (roomId === null) return;

        if (!noteText.trim()) {
            await deleteNote(roomId);
        } else {
            const note: LocationNote = {
                id: roomId,
                note: noteText.trim(),
                roomName: roomName || undefined,
                areaName: areaName || undefined,
                updatedAt: Date.now(),
            };
            await saveNote(note);
        }

        setShow(false);
    };

    const handleClose = () => {
        setShow(false);
    };

    const handleDelete = async () => {
        if (roomId === null) return;
        await deleteNote(roomId);
        setNoteText('');
        setOriginalNote('');
        setShow(false);
    };

    const hasChanges = noteText !== originalNote;

    return (
        <Modal show={show} onHide={handleClose} centered>
            <Modal.Header closeButton>
                <Modal.Title>
                    Notatka lokacji
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div className="mb-3">
                    <div className="text-muted small">
                        <strong>ID:</strong> {roomId}
                        {roomName && <span> | <strong>Nazwa:</strong> {roomName}</span>}
                        {areaName && <span> | <strong>Kraina:</strong> {areaName}</span>}
                    </div>
                </div>
                <Form.Group>
                    <Form.Control
                        as="textarea"
                        ref={textareaRef}
                        rows={6}
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Wpisz notatke..."
                    />
                </Form.Group>
                {(mapNote || pluginNotes.length > 0) && (
                    <div className="mt-3">
                        {mapNote && (
                            <div className="readonly-note-entry mb-2 p-2 rounded">
                                <div className="readonly-note-label small mb-1">Mapa</div>
                                <div className="readonly-note-text">{mapNote}</div>
                            </div>
                        )}
                        {pluginNotes.map((pn, idx) => (
                            <div key={`${pn.pluginId}-${idx}`} className="readonly-note-entry mb-2 p-2 rounded">
                                <div className="readonly-note-label small mb-1">{pn.pluginName}</div>
                                <div className="readonly-note-text">{pn.note}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Modal.Body>
            <Modal.Footer className="d-flex justify-content-between">
                <div>
                    {originalNote && (
                        <Button variant="danger" size="sm" onClick={handleDelete}>
                            Usun
                        </Button>
                    )}
                </div>
                <div className="d-flex gap-2">
                    <Button variant="secondary" onClick={handleClose}>
                        Anuluj
                    </Button>
                    <Button variant="primary" onClick={handleSave} disabled={!hasChanges && !noteText.trim()}>
                        Zapisz
                    </Button>
                </div>
            </Modal.Footer>
        </Modal>
    );
}

export default LocationNoteEditor;
