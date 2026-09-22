import { useEffect, useRef, useState, type ComponentType } from 'react';
import eventBus from '@modules/core/eventBus';
import type { ClientEvents } from '@modules/core/eventBus';

/**
 * Hosts the stock location-note editor in forge.
 *
 * `@web/LocationNoteEditor` is a self-driving dialog: it is not a catalog popup,
 * so `LayoutManagerWrapper` never mounts it, and the stock UI is the only place
 * that does (main.ts, into `#location-note-editor-root`). Without a mount here
 * the `locationNote.edit` / `locationNote.open` emits fall on the floor in forge
 * — the map's right-click "Notatka", the edit buttons in the "Notatki lokacji"
 * panel, and the map aliases all do nothing.
 *
 * It loads on demand, on the first note event rather than at boot. The event
 * that triggered the load is replayed once the editor is mounted — it subscribes
 * in its own effect, so it cannot have seen the original emit.
 */
type PendingEvent =
    | { name: 'locationNote.edit'; payload: ClientEvents['locationNote.edit'] }
    | { name: 'locationNote.open'; payload: ClientEvents['locationNote.open'] };

export default function LocationNoteHost() {
    const [Editor, setEditor] = useState<ComponentType | null>(null);
    const pending = useRef<PendingEvent | null>(null);
    const loading = useRef(false);
    const mounted = useRef(false);

    useEffect(() => {
        let cancelled = false;

        const arm = (event: PendingEvent) => {
            // Mounted already: the editor is listening for itself.
            if (mounted.current) return;
            pending.current = event;
            if (loading.current) return;
            loading.current = true;
            void import('@web/LocationNoteEditor').then((mod) => {
                if (!cancelled) setEditor(() => mod.default);
            });
        };

        const unsubEdit = eventBus.on('locationNote.edit', (payload) =>
            arm({ name: 'locationNote.edit', payload }));
        const unsubOpen = eventBus.on('locationNote.open', (payload) =>
            arm({ name: 'locationNote.open', payload }));

        return () => {
            cancelled = true;
            unsubEdit();
            unsubOpen();
        };
    }, []);

    // Runs after the editor child has committed and registered its listeners
    // (child effects run before the parent's), so the replay always lands.
    useEffect(() => {
        if (!Editor) return;
        mounted.current = true;
        const event = pending.current;
        pending.current = null;
        if (!event) return;
        if (event.name === 'locationNote.edit') {
            eventBus.emit('locationNote.edit', event.payload);
        } else {
            eventBus.emit('locationNote.open', event.payload);
        }
    }, [Editor]);

    return Editor ? <Editor /> : null;
}
