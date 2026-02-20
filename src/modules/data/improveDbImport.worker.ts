import type { SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type {
    ImproveDbResult,
    ImproveDbWorkerRequest,
    ImproveDbWorkerResponse,
} from './improveDbImport.shared';

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: (file) => (file === 'sql-wasm.wasm' ? wasmUrl : file),
        });
    }
    return sqlPromise;
}

export async function parseImproveDatabase(buffer: ArrayBuffer): Promise<ImproveDbResult> {
    const SQL = await getSql();
    const db = new SQL.Database(new Uint8Array(buffer));
    try {
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='improvee'");
        if (!tables.length || !tables[0].values.length) {
            throw new Error('Brak tabeli "improvee" w bazie danych.');
        }

        const stmt = db.prepare(
            'SELECT character, year, month, day, SUM(val) as total FROM improvee GROUP BY character, year, month, day ORDER BY year, month, day',
        );

        const byCharacter: Record<string, { date: string; count: number }[]> = {};

        while (stmt.step()) {
            const row = stmt.getAsObject() as Record<string, unknown>;
            const character = String(row.character ?? '').trim();
            const year = Number(row.year);
            const month = Number(row.month);
            const day = Number(row.day);
            const total = Number(row.total);

            if (!character || !year || !month || !day || total <= 0) continue;

            const date = `${year}/${month}/${day}`;

            if (!byCharacter[character]) {
                byCharacter[character] = [];
            }
            byCharacter[character].push({ date, count: total });
        }
        stmt.free();

        const characters = Object.keys(byCharacter).sort();
        return { characters, byCharacter };
    } finally {
        db.close();
    }
}

const ctx = self as unknown as {
    postMessage: typeof postMessage;
    addEventListener: typeof addEventListener;
    removeEventListener: typeof removeEventListener;
};

ctx.addEventListener('message', (event: MessageEvent<ImproveDbWorkerRequest>) => {
    const { data } = event;
    if (!data || data.type !== 'parse') {
        return;
    }

    (async () => {
        try {
            const result = await parseImproveDatabase(data.buffer);
            const response: ImproveDbWorkerResponse = {
                type: 'success',
                payload: result,
            };
            ctx.postMessage(response);
        } catch (error) {
            const response: ImproveDbWorkerResponse = {
                type: 'error',
                message: error instanceof Error ? error.message : 'Nie udalo sie odczytac bazy danych.',
            };
            ctx.postMessage(response);
        }
    })();
});
