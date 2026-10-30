import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database, D1PreparedStatement } from '../src/types';

/**
 * D1 over node:sqlite. D1 is SQLite, so the queries under test are the ones
 * that ship; only the async wrapper is ours. Migrations are applied from the
 * real migrations directory.
 */
export function createFakeD1(): D1Database & { raw: DatabaseSync } {
    const raw = new DatabaseSync(':memory:');
    const dir = join(import.meta.dirname, '..', 'migrations');
    for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
        raw.exec(readFileSync(join(dir, file), 'utf8'));
    }

    const statement = (query: string, values: unknown[] = []): D1PreparedStatement => ({
        bind: (...next: unknown[]) => statement(query, next),
        async first<T>() {
            return (raw.prepare(query).get(...(values as never[])) as T | undefined) ?? null;
        },
        async all<T>() {
            return { results: raw.prepare(query).all(...(values as never[])) as T[] };
        },
        async run() {
            const result = raw.prepare(query).run(...(values as never[]));
            return { meta: { changes: Number(result.changes) } };
        },
    });

    return { raw, prepare: (query: string) => statement(query) };
}
