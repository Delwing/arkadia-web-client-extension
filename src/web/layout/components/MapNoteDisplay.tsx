import { useEffect, useState, useCallback } from 'react';
import eventBus from '@modules/core/eventBus';
import { getNote, type LocationNote } from '@web/options/locationNotesStorage';
import { getPluginLocationNotes, type PluginLocationNote } from '@modules/core/pluginLocationNotesRegistry';
import { getBuiltInPanelSetting } from '../utils/layoutStorage';

export function MapNoteDisplay() {
  const [visible, setVisible] = useState(() => getBuiltInPanelSetting('map', 'alwaysShowNote', false));
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [note, setNote] = useState<LocationNote | null>(null);
  const [mapNote, setMapNote] = useState<string | null>(null);
  const [pluginNotes, setPluginNotes] = useState<PluginLocationNote[]>([]);

  // Listen for alwaysShowNote setting changes
  useEffect(() => {
    const handleAlwaysShowNote = (show: boolean) => {
      setVisible(show);
    };
    eventBus.on('mapAlwaysShowNote', handleAlwaysShowNote);
    return () => {
      eventBus.off('mapAlwaysShowNote', handleAlwaysShowNote);
    };
  }, []);

  // Listen for location changes
  useEffect(() => {
    const handleEnterLocation = (data: { id: number; room: unknown; direction: string | null }) => {
      setCurrentRoomId(data.id);
      const room = data.room as MapData.Room | undefined;
      setMapNote(room?.userData?.note ?? null);
    };
    eventBus.on('enterLocation', handleEnterLocation);
    return () => {
      eventBus.off('enterLocation', handleEnterLocation);
    };
  }, []);

  // Refresh notes when room changes
  const refreshNotes = useCallback(() => {
    if (currentRoomId === null) {
      setNote(null);
      setPluginNotes([]);
      return;
    }
    getNote(currentRoomId).then(setNote);
    setPluginNotes(getPluginLocationNotes(currentRoomId));
  }, [currentRoomId]);

  useEffect(() => {
    refreshNotes();
  }, [refreshNotes]);

  // Listen for note changes
  useEffect(() => {
    const handleNoteChanged = (data: { roomId: number }) => {
      if (data.roomId === currentRoomId) {
        refreshNotes();
      }
    };
    const handlePluginNoteChanged = (data: { roomId: number }) => {
      if (data.roomId === currentRoomId) {
        setPluginNotes(getPluginLocationNotes(currentRoomId));
      }
    };
    eventBus.on('locationNote.changed', handleNoteChanged);
    eventBus.on('pluginLocationNote.changed', handlePluginNoteChanged);
    return () => {
      eventBus.off('locationNote.changed', handleNoteChanged);
      eventBus.off('pluginLocationNote.changed', handlePluginNoteChanged);
    };
  }, [currentRoomId, refreshNotes]);

  const hasAnyNote = note || mapNote || pluginNotes.length > 0;

  if (!visible || !hasAnyNote) return null;

  return (
    <div className="map-note-display">
      {mapNote && <div>{mapNote}</div>}
      {mapNote && (note || pluginNotes.length > 0) && <hr />}
      {note && <div>{note.note}</div>}
      {note && pluginNotes.length > 0 && <hr />}
      {pluginNotes.map((pn, idx) => (
        <div key={`${pn.pluginId}-${idx}`}>{pn.note}</div>
      ))}
    </div>
  );
}
