import { useEffect, useState, useRef, useCallback } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@modules/core/eventBus";
import { getNote, type LocationNote } from "@web/options/locationNotesStorage";

export const LocationLabel = () => {
    const [label, setLabel] = useState("");
    const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
    const [note, setNote] = useState<LocationNote | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLSpanElement>(null);

    useClientEvent("mapLocationLabel", (text: string) => {
        setLabel(text);
    });

    useClientEvent("enterLocation", (data: { id: number }) => {
        setCurrentRoomId(data.id);
        setShowPopup(false);
    });

    useEffect(() => {
        eventBus.emit("requestMapLocationLabel");
    }, []);

    const refreshNote = useCallback(() => {
        if (currentRoomId === null) {
            setNote(null);
            return;
        }
        getNote(currentRoomId).then(setNote);
    }, [currentRoomId]);

    useEffect(() => {
        refreshNote();
    }, [refreshNote]);

    useClientEvent("locationNote.changed", (data: { roomId: number }) => {
        if (data.roomId === currentRoomId) {
            refreshNote();
        }
    });

    const handleIconClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
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

    return (
        <>
            {label}
            {note && (
                <span
                    ref={iconRef}
                    className="location-note-icon"
                    onClick={handleIconClick}
                    onTouchEnd={handleIconClick}
                    title="Notatka"
                >
                    &#128221;
                </span>
            )}
            {showPopup && note && (
                <div ref={popupRef} className="location-note-popup">
                    {note.note}
                </div>
            )}
        </>
    );
};
