vi.mock('sql.js/dist/sql-wasm.js', () => ({
    __esModule: true,
    default: jest.fn(),
}));

vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({
    __esModule: true,
    default: 'sql-wasm.wasm',
}));

import initSqlJs from 'sql.js/dist/sql-wasm.js';
import { __resetSqlCacheForTests, parseMultibindsDatabase } from '@web/options/multibindImport.worker';

type Row = Record<string, unknown>;

class FakeStatement {
    private index = 0;
    private current: Row | null = null;

    constructor(private readonly rows: Row[]) {}

    step(): boolean {
        if (this.index < this.rows.length) {
            this.current = this.rows[this.index];
            this.index += 1;
            return true;
        }
        this.current = null;
        return false;
    }

    getAsObject(): Row {
        return { ...(this.current ?? {}) };
    }

    free(): void {
        // no-op for tests
    }
}

interface FakeDatabaseConfig {
    tableName?: string | null;
    columns?: string[];
    rows?: Row[];
}

class FakeDatabase {
    public closed = false;

    constructor(private readonly config: FakeDatabaseConfig) {}

    exec(query: string): Array<{ values: unknown[][] }> {
        if (query.startsWith("SELECT name FROM sqlite_master")) {
            if (!this.config.tableName) {
                return [];
            }
            return [{ values: [[this.config.tableName]] }];
        }
        if (query.startsWith('PRAGMA table_info')) {
            const columns = this.config.columns ?? [];
            return [{ values: columns.map((name, idx) => [idx, name]) }];
        }
        throw new Error(`Unexpected query: ${query}`);
    }

    prepare(_query: string): FakeStatement {
        return new FakeStatement(this.config.rows ?? []);
    }

    close(): void {
        this.closed = true;
    }
}

const mockedInitSqlJs = initSqlJs as unknown as jest.Mock;

describe('parseMultibindsDatabase', () => {
    beforeEach(() => {
        mockedInitSqlJs.mockReset();
        __resetSqlCacheForTests();
    });

    it('parses rows and tracks invalid entries', async () => {
        const database = new FakeDatabase({
            tableName: 'multibinds',
            columns: ['_row_id', 'Index', 'Uniqness', 'ROOM_ID', 'action'],
            rows: [
                { idx: 1, uniq: 'abc', roomId: 12, action: 'say hi' },
                { idx: 2, uniq: '   ', roomId: 34, action: 'cmd' },
                { idx: 9, uniq: 'ignored', roomId: 8, action: 'skip' },
            ],
        });

        mockedInitSqlJs.mockImplementation(async () => ({
            Database: jest.fn(function () { return database; }),
        }));

        const result = await parseMultibindsDatabase(new ArrayBuffer(0));

        expect(result).toEqual({
            rows: [
                { uniqness: 'abc', roomId: 12, index: 1, action: 'say hi' },
                { uniqness: '34:2', roomId: 34, index: 2, action: 'cmd' },
            ],
            totalRows: 3,
            invalidRows: 1,
        });
        expect(database.closed).toBe(true);
    });

    it('throws a descriptive error when the multibinds table is missing', async () => {
        const database = new FakeDatabase({
            tableName: null,
            columns: [],
            rows: [],
        });

        mockedInitSqlJs.mockImplementation(async () => ({
            Database: jest.fn(function () { return database; }),
        }));

        await expect(parseMultibindsDatabase(new ArrayBuffer(0))).rejects.toThrow('Tabela "multibinds" nie została znaleziona.');
        expect(database.closed).toBe(true);
    });
});
