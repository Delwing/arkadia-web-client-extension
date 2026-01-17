import { useEffect, useState, useRef, useCallback } from 'react';
import eventBus from '@modules/core/eventBus';
import { getNote, type LocationNote } from '@web/options/locationNotesStorage';
import { getPluginLocationNotes, type PluginLocationNote } from '@modules/core/pluginLocationNotesRegistry';
import { getBuiltInPanelSetting } from '../utils/layoutStorage';

/**
 * Note icon that shows on the map when label is in header mode.
 * This provides access to notes when the LocationLabel (with its note icon) is hidden.
 */
export function MapNoteIcon() {
  const [labelVisible, setLabelVisible] = useState(() => getBuiltInPanelSetting('map', 'labelVisible', true));
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [note, setNote] = useState<LocationNote | null>(null);
  const [mapNote, setMapNote] = useState<string | null>(null);
  const [pluginNotes, setPluginNotes] = useState<PluginLocationNote[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);

  // Listen for label visibility changes
  useEffect(() => {
    const handleVisibility = (visible: boolean) => {
      setLabelVisible(visible);
      if (visible) setShowPopup(false);
    };
    eventBus.on('mapLabelVisibility', handleVisibility);
    return () => {
      eventBus.off('mapLabelVisibility', handleVisibility);
    };
  }, []);

  // Listen for location changes
  useEffect(() => {
    const handleEnterLocation = (data: { id: number; room: unknown }) => {
      setCurrentRoomId(data.id);
      const room = data.room as MapData.Room | undefined;
      setMapNote(room?.userData?.note ?? null);
      setShowPopup(false);
    };
    eventBus.on('enterLocation', handleEnterLocation);
    return () => {
      eventBus.off('enterLocation', handleEnterLocation);
    };
  }, []);

  // Refresh notes
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

  // Close popup when clicking outside
  useEffect(() => {
    if (!showPopup) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        popupRef.current && !popupRef.current.contains(target) &&
        iconRef.current && !iconRef.current.contains(target)
      ) {
        setShowPopup(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showPopup]);

  const hasAnyNote = note || mapNote || pluginNotes.length > 0;

  // Only show when label is in header mode and there are notes
  if (labelVisible || !hasAnyNote) return null;

  return (
    <>
      <button
        ref={iconRef}
        type="button"
        className="map-note-icon-button"
        onClick={() => setShowPopup(prev => !prev)}
        title="Notatka"
      >
        &#128221;
      </button>
      {showPopup && (
        <div ref={popupRef} className="map-note-icon-popup">
          {mapNote && <div>{mapNote}</div>}
          {mapNote && (note || pluginNotes.length > 0) && <hr />}
          {note && <div>{note.note}</div>}
          {note && pluginNotes.length > 0 && <hr />}
          {pluginNotes.map((pn, idx) => (
            <div key={`${pn.pluginId}-${idx}`}>{pn.note}</div>
          ))}
        </div>
      )}
    </>
  );
}
