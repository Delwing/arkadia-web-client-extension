import type { SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export interface MultibindImportRow {
    uniqness: string;
    roomId: number;
    index: number;
    action: string;
}

export interface ParsedMultibindDatabase {
    rows: MultibindImportRow[];
    totalRows: number;
    invalidRows: number;
}

const REQUIRED_COLUMNS = ['_row_id', 'index', 'uniqness', 'room_id', 'action'] as const;
const MAX_MULTIBIND_INDEX = 4;

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: (file) => file === 'sql-wasm.wasm' ? wasmUrl : file,
        });
    }
    return sqlPromise;
}

function normalizeUniqness(raw: unknown, roomId: number, index: number): string {
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return `${roomId}:${index}`;
}

function extractColumns(result: any): string[] {
    if (!result || !Array.isArray(result.values)) {
        return [];
    }
    return result.values
        .map((row: any[]) => (row?.[1] !== undefined ? String(row[1]) : ''))
        .filter(Boolean);
}

export async function parseMultibindsDatabase(buffer: ArrayBuffer): Promise<ParsedMultibindDatabase> {
    const SQL = await getSql();
    const db = new SQL.Database(new Uint8Array(buffer));
    try {
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        const tableName = tables
            .flatMap(result => result.values as any[][])
            .map(([name]) => String(name))
            .find(name => name?.toLowerCase() === 'multibinds');
        if (!tableName) {
            throw new Error('Tabela "multibinds" nie została znaleziona.');
        }

        const pragma = db.exec(`PRAGMA table_info(\"${tableName}\")`);
        const columns = extractColumns(pragma[0]);
        const lowerColumns = columns.map(name => name.toLowerCase());
        const missing = REQUIRED_COLUMNS.filter(col => !lowerColumns.includes(col));
        if (missing.length) {
            throw new Error(`Tabela "${tableName}" nie zawiera wymaganych kolumn: ${missing.join(', ')}`);
        }

        const columnMap = new Map<string, string>();
        columns.forEach(name => columnMap.set(name.toLowerCase(), name));
        const columnIndex = columnMap.get('index')!;
        const columnUniq = columnMap.get('uniqness')!;
        const columnRoom = columnMap.get('room_id')!;
        const columnAction = columnMap.get('action')!;

        const stmt = db.prepare(`SELECT "${columnIndex}" as idx, "${columnUniq}" as uniq, "${columnRoom}" as roomId, "${columnAction}" as action FROM "${tableName}"`);

        const rows: MultibindImportRow[] = [];
        let totalRows = 0;
        let invalidRows = 0;
        while (stmt.step()) {
            totalRows += 1;
            const row = stmt.getAsObject() as Record<string, unknown>;
            const roomIdRaw = Number(row.roomId);
            const indexRaw = Number(row.idx);
            const action = typeof row.action === 'string' ? row.action : String(row.action ?? '');
            if (!Number.isFinite(roomIdRaw) || !Number.isFinite(indexRaw)) {
                invalidRows += 1;
                continue;
            }
            const roomId = Math.trunc(roomIdRaw);
            const index = Math.trunc(indexRaw);
            if (index < 1 || index > MAX_MULTIBIND_INDEX || Number.isNaN(roomId)) {
                invalidRows += 1;
                continue;
            }
            const uniqness = normalizeUniqness(row.uniq, roomId, index);
            rows.push({ uniqness, roomId, index, action });
        }
        stmt.free();

        return { rows, totalRows, invalidRows };
    } finally {
        db.close();
    }
}
