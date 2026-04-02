import type { SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type {
    WiedzaDbResult,
    WiedzaDbWorkerRequest,
    WiedzaDbWorkerResponse,
    WiedzaDbEvent,
    WiedzaDbLibrary,
    WiedzaDbBook,
    WiedzaDbTotalLevel,
} from './wiedzaDbImport.shared';

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: (file) => (file === 'sql-wasm.wasm' ? wasmUrl : file),
        });
    }
    return sqlPromise;
}

const KNOWLEDGE_LEVELS = new Set([
    'brak', 'znikoma', 'niewielka', 'czesciowa', 'niezla',
    'dosc dobra', 'dobra', 'bardzo dobra', 'doskonala',
    'prawie pelna', 'pelna',
]);

const DATIVE_TO_BASE: Record<string, string> = {
    'o chaosie i jego tworach': 'Chaos i jego twory',
    'o goblinoidach': 'goblinoidy',
    'o golemach': 'golemy',
    'o istotach demonicznych': 'istoty demoniczne',
    'o jaszczuroludziach': 'jaszczuroludzie',
    'o magii i jej tworach': 'magia i jej twory',
    'o nieumarlych': 'nieumarli',
    'o pajakach i pajakowatych': 'pajaki i pajakowate',
    'o ryboludziach': 'ryboludzie',
    'o smokach i smokowatych': 'smoki i smokowate',
    'o starszych rasach': 'starsze rasy',
    'o stworach pokoniunkcyjnych': 'stwory pokoniunkcyjne',
    'o szczuroludziach': 'szczuroludzie',
    'o wampirach': 'wampiry',
};

function parseDateToTimestamp(dateStr: string): number {
    // Format: "2022-09-11 11:41:39"
    const d = new Date(dateStr + 'Z');
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

function tableExists(db: InstanceType<SqlJsStatic['Database']>, name: string): boolean {
    const result = db.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
    );
    return result.length > 0 && result[0].values.length > 0;
}

export async function parseWiedzaDatabase(buffer: ArrayBuffer): Promise<WiedzaDbResult> {
    const SQL = await getSql();
    const db = new SQL.Database(new Uint8Array(buffer));
    try {
        const byCharacter: WiedzaDbResult['byCharacter'] = {};

        function ensureCharacter(name: string) {
            if (!byCharacter[name]) {
                byCharacter[name] = {
                    events: [],
                    libraries: [],
                    books: [],
                    totalLevels: [],
                };
            }
            return byCharacter[name];
        }

        // Parse events table (ticks only)
        if (tableExists(db, 'events')) {
            const stmt = db.prepare(
                "SELECT character, oczym, lok_id, changed FROM events WHERE typ='tick' ORDER BY changed",
            );
            while (stmt.step()) {
                const row = stmt.getAsObject() as Record<string, unknown>;
                const character = String(row.character ?? '').trim();
                const oczym = String(row.oczym ?? '').trim();
                const lokId = Number(row.lok_id ?? 0);
                const changed = String(row.changed ?? '');

                if (!character || !oczym) continue;

                const baseName = DATIVE_TO_BASE[oczym];
                if (!baseName) continue;

                const data = ensureCharacter(character);
                const event: WiedzaDbEvent = {
                    category: baseName as WiedzaDbEvent['category'],
                    categoryDative: oczym,
                    type: 'tick',
                    locationId: lokId,
                    timestamp: parseDateToTimestamp(changed),
                };
                data.events.push(event);
            }
            stmt.free();
        }

        // Parse biblioteki table (library completions)
        if (tableExists(db, 'biblioteki')) {
            const stmt = db.prepare(
                'SELECT character, oczym, lok_id, changed FROM biblioteki ORDER BY changed',
            );
            while (stmt.step()) {
                const row = stmt.getAsObject() as Record<string, unknown>;
                const character = String(row.character ?? '').trim();
                const oczym = String(row.oczym ?? '').trim();
                const lokId = Number(row.lok_id ?? 0);
                const changed = String(row.changed ?? '');

                if (!character || !oczym || !lokId) continue;

                const data = ensureCharacter(character);
                const lib: WiedzaDbLibrary = {
                    locationId: lokId,
                    categoryDative: oczym,
                    timestamp: parseDateToTimestamp(changed),
                };
                data.libraries.push(lib);
            }
            stmt.free();
        }

        // Parse ksiegi table (book completions)
        if (tableExists(db, 'ksiegi')) {
            const stmt = db.prepare(
                'SELECT character, oczym, nazwa, changed FROM ksiegi ORDER BY changed',
            );
            while (stmt.step()) {
                const row = stmt.getAsObject() as Record<string, unknown>;
                const character = String(row.character ?? '').trim();
                const oczym = String(row.oczym ?? '').trim();
                const nazwa = String(row.nazwa ?? '').trim();
                const changed = String(row.changed ?? '');

                if (!character || !oczym || !nazwa) continue;

                const data = ensureCharacter(character);
                const book: WiedzaDbBook = {
                    bookName: nazwa,
                    categoryDative: oczym,
                    timestamp: parseDateToTimestamp(changed),
                };
                data.books.push(book);
            }
            stmt.free();
        }

        // Parse wiedza_total table (overall levels)
        if (tableExists(db, 'wiedza_total')) {
            const stmt = db.prepare(
                'SELECT character, oczym, poziom, changed FROM wiedza_total ORDER BY changed',
            );
            while (stmt.step()) {
                const row = stmt.getAsObject() as Record<string, unknown>;
                const character = String(row.character ?? '').trim();
                const oczym = String(row.oczym ?? '').trim();
                const poziom = String(row.poziom ?? '').trim().toLowerCase();
                const changed = String(row.changed ?? '');

                if (!character || !oczym || !KNOWLEDGE_LEVELS.has(poziom)) continue;

                const data = ensureCharacter(character);
                const level: WiedzaDbTotalLevel = {
                    categoryName: oczym,
                    level: poziom,
                    timestamp: parseDateToTimestamp(changed),
                };
                data.totalLevels.push(level);
            }
            stmt.free();
        }

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

ctx.addEventListener('message', (event: MessageEvent<WiedzaDbWorkerRequest>) => {
    const { data } = event;
    if (!data || data.type !== 'parse') {
        return;
    }

    (async () => {
        try {
            const result = await parseWiedzaDatabase(data.buffer);
            const response: WiedzaDbWorkerResponse = {
                type: 'success',
                payload: result,
            };
            ctx.postMessage(response);
        } catch (error) {
            const response: WiedzaDbWorkerResponse = {
                type: 'error',
                message: error instanceof Error ? error.message : 'Nie udalo sie odczytac bazy danych.',
            };
            ctx.postMessage(response);
        }
    })();
});
