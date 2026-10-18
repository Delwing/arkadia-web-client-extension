import type { SqliteRows } from '@modules/data/sqliteRead.worker';
import { parseInWorker } from './imports/parseInWorker';

/** `api.sqlite.read` for plugins: runs the queries in a worker, like the Mudlet database imports. */
export function readPluginSqlite(buffer: ArrayBuffer, queries: Record<string, string>): Promise<SqliteRows> {
    return parseInWorker<SqliteRows>(
        () => new Worker(new URL('@modules/data/sqliteRead.worker.ts', import.meta.url), { type: 'module' }),
        buffer,
        { queries },
    );
}
