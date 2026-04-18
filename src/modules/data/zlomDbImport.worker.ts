import type { SqlJsStatic, Database } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { WeaponEntry, ArmorEntry, ShieldEntry } from './zlomStore';
import type {
    ZlomDbResult,
    ZlomDbWorkerRequest,
    ZlomDbWorkerResponse,
} from './zlomDbImport.shared';

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: (file) => (file === 'sql-wasm.wasm' ? wasmUrl : file),
        });
    }
    return sqlPromise;
}

function tableExists(db: Database, name: string): boolean {
    const res = db.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
    );
    return res.length > 0 && res[0].values.length > 0;
}

function str(v: unknown): string {
    return v == null ? '' : String(v);
}

function num(v: unknown): number {
    if (v == null) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function bit(v: unknown): 0 | 1 {
    return num(v) > 0 ? 1 : 0;
}

function roomId(v: unknown): number | null {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n < 0 ? null : n;
}

function readBronie(db: Database): WeaponEntry[] {
    if (!tableExists(db, 'bronie')) return [];
    const stmt = db.prepare('SELECT * FROM bronie');
    const out: WeaponEntry[] = [];
    try {
        while (stmt.step()) {
            const r = stmt.getAsObject() as Record<string, unknown>;
            const short = str(r.short);
            if (!short) continue;
            out.push({
                short,
                typ: str(r.typ),
                rodzaj: str(r.rodzaj),
                klute: num(r.klute),
                obuch: num(r.obuch),
                ciete: num(r.ciete),
                chwyt: str(r.chwyt),
                magik: bit(r.magik),
                srebro: bit(r.srebro),
                opis: str(r.opis),
                waga: num(r.waga),
                obj: num(r.obj),
                cena: num(r.cena),
                wywazenie: num(r.wywazenie),
                parowanie: num(r.parowanie),
                roomId: roomId(r.room_id),
            });
        }
    } finally {
        stmt.free();
    }
    return out;
}

function readTarcze(db: Database): ShieldEntry[] {
    if (!tableExists(db, 'tarcze')) return [];
    const stmt = db.prepare('SELECT * FROM tarcze');
    const out: ShieldEntry[] = [];
    try {
        while (stmt.step()) {
            const r = stmt.getAsObject() as Record<string, unknown>;
            const short = str(r.short);
            if (!short) continue;
            out.push({
                short,
                klute: num(r.klute),
                obuch: num(r.obuch),
                ciete: num(r.ciete),
                magik: bit(r.magik),
                opis: str(r.opis),
                waga: num(r.waga),
                obj: num(r.obj),
                cena: num(r.cena),
                parowanie: num(r.parowanie),
                oslona: str(r.oslona),
                roomId: roomId(r.room_id),
            });
        }
    } finally {
        stmt.free();
    }
    return out;
}

function readZbroje(db: Database): ArmorEntry[] {
    if (!tableExists(db, 'zbroje')) return [];
    const stmt = db.prepare('SELECT * FROM zbroje');
    const out: ArmorEntry[] = [];
    try {
        while (stmt.step()) {
            const r = stmt.getAsObject() as Record<string, unknown>;
            const short = str(r.short);
            if (!short) continue;
            out.push({
                short,
                typ: str(r.typ),
                klute: num(r.klute),
                obuch: num(r.obuch),
                ciete: num(r.ciete),
                magik: bit(r.magik),
                opis: str(r.opis),
                waga: num(r.waga),
                obj: num(r.obj),
                cena: num(r.cena),
                oslona: str(r.oslona),
                roomId: roomId(r.room_id),
            });
        }
    } finally {
        stmt.free();
    }
    return out;
}

export async function parseZlomDatabase(buffer: ArrayBuffer): Promise<ZlomDbResult> {
    const SQL = await getSql();
    const db = new SQL.Database(new Uint8Array(buffer));
    try {
        const bronie = readBronie(db);
        const tarcze = readTarcze(db);
        const zbroje = readZbroje(db);
        if (bronie.length === 0 && tarcze.length === 0 && zbroje.length === 0) {
            throw new Error('Baza nie zawiera tabel bronie/tarcze/zbroje lub sa puste.');
        }
        return { bronie, tarcze, zbroje };
    } finally {
        db.close();
    }
}

const ctx = self as unknown as {
    postMessage: typeof postMessage;
    addEventListener: typeof addEventListener;
    removeEventListener: typeof removeEventListener;
};

ctx.addEventListener('message', (event: MessageEvent<ZlomDbWorkerRequest>) => {
    const { data } = event;
    if (!data || data.type !== 'parse') return;

    (async () => {
        try {
            const result = await parseZlomDatabase(data.buffer);
            const response: ZlomDbWorkerResponse = {
                type: 'success',
                payload: result,
            };
            ctx.postMessage(response);
        } catch (error) {
            const response: ZlomDbWorkerResponse = {
                type: 'error',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Nie udalo sie odczytac bazy danych.',
            };
            ctx.postMessage(response);
        }
    })();
});
