import type { SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { parseDepositRows, type DepositDbResult, type DepositDbRow } from './depositDbImport.shared';

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: (file) => (file === 'sql-wasm.wasm' ? wasmUrl : file),
        });
    }
    return sqlPromise;
}

export async function parseDepositDatabase(buffer: ArrayBuffer): Promise<DepositDbResult> {
    const SQL = await getSql();
    const db = new SQL.Database(new Uint8Array(buffer));
    try {
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='boxes'");
        if (!tables.length || !tables[0].values.length) {
            throw new Error('Brak tabeli "boxes" w bazie danych. Wybierz plik Database_boxestwo.db.');
        }

        const stmt = db.prepare('SELECT character, bank, box FROM boxes');
        const rows: DepositDbRow[] = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject() as unknown as DepositDbRow);
        }
        stmt.free();
        return parseDepositRows(rows);
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
            ctx.postMessage({ type: 'success', payload: await parseDepositDatabase(data.buffer) });
        } catch (error) {
            ctx.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Nie udało się odczytać bazy danych.',
            });
        }
    })();
});
