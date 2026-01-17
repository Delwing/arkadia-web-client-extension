import { useEffect, useState, useRef, useCallback } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@modules/core/eventBus";
import { getNote, type LocationNote } from "@web/options/locationNotesStorage";
import { getPluginLocationNotes, type PluginLocationNote } from "@modules/core/pluginLocationNotesRegistry";

export const LocationLabel = () => {
    const [label, setLabel] = useState("");
    const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
    const [note, setNote] = useState<LocationNote | null>(null);
    const [mapNote, setMapNote] = useState<string | null>(null);
    const [pluginNotes, setPluginNotes] = useState<PluginLocationNote[]>([]);
    const [showPopup, setShowPopup] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLSpanElement>(null);

    useClientEvent("mapLocationLabel", (text: string) => {
        setLabel(text);
    });

    useClientEvent("enterLocation", (data: { id: number; room?: MapData.Room }) => {
        setCurrentRoomId(data.id);
        setMapNote(data.room?.userData?.note ?? null);
        setShowPopup(false);
    });

    useEffect(() => {
        eventBus.emit("requestMapLocationLabel");
    }, []);

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

    useClientEvent("locationNote.changed", (data: { roomId: number }) => {
        if (data.roomId === currentRoomId) {
            refreshNotes();
        }
    });

    useClientEvent("pluginLocationNote.changed", (data: { roomId: number }) => {
        if (data.roomId === currentRoomId) {
            setPluginNotes(getPluginLocationNotes(currentRoomId));
        }
    });

    const handleIconClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setShowPopup(prev => !prev);
    }, []);

    const handleIconTouch = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowPopup(prev => !prev);
    }, []);

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

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [showPopup]);

    const hasAnyNote = note || mapNote || pluginNotes.length > 0;

    return (
        <>
            {label}
            {hasAnyNote && (
                <span
                    ref={iconRef}
                    className="location-note-icon"
                    onClick={handleIconClick}
                    onTouchStart={handleIconTouch}
                    title="Notatka"
                >
                    &#128221;
                </span>
            )}
            {showPopup && hasAnyNote && (
                <div ref={popupRef} className="location-note-popup">
                    {mapNote && <div>{mapNote}</div>}
                    {mapNote && (note || pluginNotes.length > 0) && <hr style={{ margin: '0.5rem 0', borderColor: 'rgba(255,255,255,0.3)' }} />}
                    {note && <div>{note.note}</div>}
                    {note && pluginNotes.length > 0 && <hr style={{ margin: '0.5rem 0', borderColor: 'rgba(255,255,255,0.3)' }} />}
                    {pluginNotes.map((pn, idx) => (
                        <div key={`${pn.pluginId}-${idx}`}>{pn.note}</div>
                    ))}
                </div>
            )}
        </>
    );
};
