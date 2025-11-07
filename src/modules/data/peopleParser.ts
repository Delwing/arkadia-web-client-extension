import type { SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { resolveGuild } from './peopleGuilds';
import {PersonEntry} from "@client/types/people.ts";

let sqlPromise: Promise<SqlJsStatic> | null = null;

function normalizeText(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}

async function getSql(): Promise<SqlJsStatic> {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: (file) => (file === 'sql-wasm.wasm' ? wasmUrl : file),
        });
    }
    return sqlPromise;
}

export async function parsePeopleDatabase(buffer: ArrayBuffer): Promise<PersonEntry[]> {
    const SQL = await getSql();
    const db = new SQL.Database(new Uint8Array(buffer));
    try {
        const stmt = db.prepare('SELECT name, short, guild FROM people');
        const people: PersonEntry[] = [];
        while (stmt.step()) {
            const row = stmt.getAsObject() as Record<string, unknown>;
            const name = normalizeText(row.name);
            const description = normalizeText(row.short);
            const guild = resolveGuild(row.guild);
            if (!name || !description) {
                continue;
            }
            people.push({ name, description, guild });
        }
        stmt.free();
        return people;
    } finally {
        db.close();
    }
}
