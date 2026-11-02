/**
 * The map over the output, following the room the PC reports. Hidden rather
 * than unmounted when closed; coming back into view re-centres it (the
 * renderer's resize observer sees the size change).
 */

import { useEffect, useRef, useState } from "react";
import type { PhoneMap } from "./phoneMap";

export function MapPanel({ roomId, visible }: { roomId: number | null; visible: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<PhoneMap | null>(null);
    const roomRef = useRef(roomId);
    roomRef.current = roomId;
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
        let disposed = false;
        import("./phoneMap")
            .then(({ createPhoneMap }) => createPhoneMap(containerRef.current!))
            .then(map => {
                if (disposed) {
                    map.destroy();
                    return;
                }
                mapRef.current = map;
                map.show(roomRef.current);
                setStatus('ready');
            })
            .catch(error => {
                console.warn('[remote] map failed to load:', error);
                if (!disposed) setStatus('error');
            });
        return () => {
            disposed = true;
            mapRef.current?.destroy();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        mapRef.current?.show(roomId);
    }, [roomId]);

    return (
        <div className="rc-map" hidden={!visible}>
            <div ref={containerRef} className="rc-map-canvas"/>
            {status === 'loading' && <div className="rc-map-note">Wczytywanie mapy…</div>}
            {status === 'error' && <div className="rc-map-note">Nie udało się wczytać mapy.</div>}
            {status === 'ready' && !roomId && <div className="rc-map-note">Nieznane położenie</div>}
        </div>
    );
}
