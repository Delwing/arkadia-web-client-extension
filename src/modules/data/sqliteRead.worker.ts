import type { SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/** Rows of each named query, every row an object keyed by column. */
export type SqliteRows = Record<string, Record<string, unknown>[]>;

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: (file) => (file === 'sql-wasm.wasm' ? wasmUrl : file),
        });
    }
    return sqlPromise;
}

/**
 * Runs each query against a SQLite file (e.g. a Mudlet database) and returns
 * its rows. The file is opened in memory, so nothing a query does reaches it.
 */
export async function readSqliteDatabase(buffer: ArrayBuffer, queries: Record<string, string>): Promise<SqliteRows> {
    const SQL = await getSql();
    let db;
    try {
        db = new SQL.Database(new Uint8Array(buffer));
        db.exec('SELECT 1 FROM sqlite_master LIMIT 1');
    } catch {
        db?.close();
        throw new Error('To nie jest plik bazy SQLite.');
    }
    try {
        const result: SqliteRows = {};
        for (const [name, sql] of Object.entries(queries)) {
            const stmt = db.prepare(sql);
            const rows: Record<string, unknown>[] = [];
            try {
                while (stmt.step()) rows.push(stmt.getAsObject());
            } finally {
                stmt.free();
            }
            result[name] = rows;
        }
        return result;
    } finally {
        db.close();
    }
}

const ctx = self as unknown as {
    postMessage: typeof postMessage;
    addEventListener: typeof addEventListener;
};

ctx.addEventListener('message', (event: MessageEvent<{ type: 'parse'; buffer: ArrayBuffer; queries: Record<string, string> }>) => {
    const { data } = event;
    if (!data || data.type !== 'parse') {
        return;
    }

    (async () => {
        try {
            ctx.postMessage({ type: 'success', payload: await readSqliteDatabase(data.buffer, data.queries) });
        } catch (error) {
            ctx.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Nie udało się odczytać bazy danych.',
            });
        }
    })();
});
