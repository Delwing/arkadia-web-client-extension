vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({
    __esModule: true,
    default: require.resolve('sql.js/dist/sql-wasm.wasm'),
}));

import initSqlJs from 'sql.js/dist/sql-wasm.js';
import { readSqliteDatabase } from '@modules/data/sqliteRead.worker';

async function databaseFile(): Promise<ArrayBuffer> {
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
    const db = new SQL.Database();
    db.run('CREATE TABLE notes (character TEXT, room INTEGER, text TEXT)');
    db.run("INSERT INTO notes VALUES ('Bodrin', 12, 'sklep'), ('Bodrin', 40, 'kuznia'), ('Amelia', 12, 'brama')");
    const bytes = db.export();
    db.close();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('readSqliteDatabase', () => {
    test('returns the rows of each named query as objects', async () => {
        const rows = await readSqliteDatabase(await databaseFile(), {
            bodrin: "SELECT room, text FROM notes WHERE character = 'Bodrin' ORDER BY room",
            count: 'SELECT COUNT(*) AS n FROM notes',
        });
        expect(rows).toEqual({
            bodrin: [{ room: 12, text: 'sklep' }, { room: 40, text: 'kuznia' }],
            count: [{ n: 3 }],
        });
    });

    test('rejects a file that is not a SQLite database, and a bad query', async () => {
        await expect(readSqliteDatabase(new TextEncoder().encode('to nie baza').buffer as ArrayBuffer, { a: 'SELECT 1' }))
            .rejects.toThrow('To nie jest plik bazy SQLite.');
        await expect(readSqliteDatabase(await databaseFile(), { a: 'SELECT * FROM missing' })).rejects.toThrow(/no such table/);
    });
});
