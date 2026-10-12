import type { SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { parseKillRows, type KillDbResult, type KillDbRow } from './killDbImport.shared';

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: (file) => (file === 'sql-wasm.wasm' ? wasmUrl : file),
        });
    }
    return sqlPromise;
}

export async function parseKillDatabase(buffer: ArrayBuffer): Promise<KillDbResult> {
    const SQL = await getSql();
    const db = new SQL.Database(new Uint8Array(buffer));
    try {
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='counter2_daysum'");
        if (!tables.length || !tables[0].values.length) {
            throw new Error('Brak tabeli "counter2_daysum" w bazie danych. Wybierz plik Database_counterdaysum.db.');
        }

        const stmt = db.prepare('SELECT character, year, month, day, type, amount FROM counter2_daysum');
        const rows: KillDbRow[] = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject() as unknown as KillDbRow);
        }
        stmt.free();
        return parseKillRows(rows);
    } finally {
        db.close();
    }
}

const ctx = self as unknown as {
    postMessage: typeof postMessage;
    addEventListener: typeof addEventListener;
};

ctx.addEventListener('message', (event: MessageEvent<{ type: 'parse'; buffer: ArrayBuffer }>) => {
    const { data } = event;
    if (!data || data.type !== 'parse') {
        return;
    }

    (async () => {
        try {
            ctx.postMessage({ type: 'success', payload: await parseKillDatabase(data.buffer) });
        } catch (error) {
            ctx.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Nie udało się odczytać bazy danych.',
            });
        }
    })();
});
