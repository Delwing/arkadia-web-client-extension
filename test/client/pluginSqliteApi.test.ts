import { PluginApiImpl } from '@client/PluginApi';
import { getPluginHostPort, setPluginHostPort } from '@client/ports';

describe('plugin sqlite api', () => {
    const original = getPluginHostPort();
    afterEach(() => setPluginHostPort(original));

    test('hands a copy of the file to the host and returns its rows', async () => {
        const readSqlite = jest.fn(async () => ({ notes: [{ room: 12 }] }));
        setPluginHostPort({ ...original, readSqlite });
        const api = new PluginApiImpl({} as never, 'jubiler');
        const bytes = new Uint8Array([1, 2, 3]).buffer;

        await expect(api.sqlite.read(bytes, { notes: 'SELECT room FROM notes' })).resolves.toEqual({ notes: [{ room: 12 }] });
        const [sent, queries] = readSqlite.mock.calls[0] as unknown as [ArrayBuffer, Record<string, string>];
        expect(sent).not.toBe(bytes);
        expect(new Uint8Array(sent)).toEqual(new Uint8Array([1, 2, 3]));
        expect(queries).toEqual({ notes: 'SELECT room FROM notes' });

        await api.sqlite.read(new Blob([new Uint8Array([4, 5])]), {});
        expect(new Uint8Array((readSqlite.mock.calls[1] as unknown as [ArrayBuffer])[0])).toEqual(new Uint8Array([4, 5]));
    });

    test('rejects without a UI host', async () => {
        const api = new PluginApiImpl({} as never, 'jubiler');
        await expect(api.sqlite.read(new ArrayBuffer(0), {})).rejects.toThrow(/UI host/);
    });
});
