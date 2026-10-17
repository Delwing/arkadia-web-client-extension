import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

vi.mock('@modules/core/eventBus', () => ({
    __esModule: true,
    default: { emit: vi.fn() },
}));

import eventBus from '@modules/core/eventBus';
import { getAllNotes, replaceAllNotes, saveNote, type LocationNote } from '@modules/data/locationNotesStorage';

const note = (id: number, text: string): LocationNote => ({ id, note: text, updatedAt: 1 });

describe('replaceAllNotes', () => {
    beforeEach(() => {
        globalThis.indexedDB = new IDBFactory();
        vi.mocked(eventBus.emit).mockClear();
    });

    it('deletes notes missing from the synced list', async () => {
        await saveNote(note(1, 'a'));
        await saveNote(note(2, 'b'));

        await replaceAllNotes([note(2, 'b')]);

        expect(await getAllNotes()).toEqual([note(2, 'b')]);
    });

    it('clears the store for an empty list', async () => {
        await saveNote(note(1, 'a'));

        await replaceAllNotes([]);

        expect(await getAllNotes()).toEqual([]);
    });

    it('emits locationNote.changed only for added, changed and removed rooms', async () => {
        await saveNote(note(1, 'a'));
        await saveNote(note(2, 'b'));
        await saveNote(note(3, 'c'));
        vi.mocked(eventBus.emit).mockClear();

        await replaceAllNotes([note(1, 'a'), note(2, 'B'), note(4, 'd')]);

        const rooms = vi.mocked(eventBus.emit).mock.calls
            .filter(([event]) => event === 'locationNote.changed')
            .map(([, payload]) => (payload as { roomId: number }).roomId)
            .sort();
        expect(rooms).toEqual([2, 3, 4]);
    });
});
