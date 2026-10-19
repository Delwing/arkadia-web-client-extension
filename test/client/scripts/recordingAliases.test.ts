import initRecordingAliases from '@client/scripts/recordingAliases';
import eventBus from '@modules/core/eventBus';
import type { RecordingRequest } from '@shared/events';

let offs: (() => void)[] = [];

class FakeClient {
    println = jest.fn();
    on = (...args: Parameters<typeof eventBus.on>) => {
        const off = eventBus.on(...args);
        offs.push(off);
        return off;
    };
    sendEvent = (type: string, ...args: unknown[]) => (eventBus.emit as (...a: unknown[]) => void)(type, ...args);
}

describe('/nagrywaj aliases', () => {
    let client: FakeClient;
    let aliases: { pattern: RegExp; callback: Function }[];

    const run = (line: string): boolean => {
        for (const alias of aliases) {
            const match = line.match(alias.pattern);
            if (match) {
                alias.callback(match);
                return true;
            }
        }
        return false;
    };

    /** Stands in for the UI's RecordingManager: one recording at a time. */
    function fakeManager(initial: string | null) {
        let active = initial;
        const requests: RecordingRequest[] = [];
        offs.push(eventBus.on('recording.request', (request) => {
            requests.push(request);
            const before = active;
            let started: string | null = null;
            if (request.action === 'start' && !active) active = started = request.name ?? 'auto-name';
            if (request.action === 'stop') active = null;
            eventBus.emit('recording.request.done', { request, active: before, started });
        }));
        return requests;
    }

    beforeEach(() => {
        offs = [];
        client = new FakeClient();
        aliases = [];
        initRecordingAliases(client as unknown as any, aliases);
    });

    afterEach(() => offs.forEach(off => off()));


    it('starts a recording with the given name', () => {
        const requests = fakeManager(null);
        expect(run('/nagrywaj  walka z trollem ')).toBe(true);
        expect(requests).toEqual([{ action: 'start', name: 'walka z trollem' }]);
        expect(client.println).toHaveBeenCalledWith(expect.stringContaining('Nagrywanie rozpoczete: walka z trollem'));
    });

    it('starts without a name', () => {
        const requests = fakeManager(null);
        run('/nagrywaj');
        expect(requests).toEqual([{ action: 'start', name: undefined }]);
    });

    it('does not replace a recording in progress', () => {
        fakeManager('stare');
        run('/nagrywaj nowe');
        expect(client.println).toHaveBeenCalledWith(expect.stringContaining('Nagrywanie juz trwa: stare'));
    });

    it('stops and saves', () => {
        const requests = fakeManager('sesja');
        expect(run('/nagrywaj_stop')).toBe(true);
        expect(requests).toEqual([{ action: 'stop', save: true }]);
        expect(client.println).toHaveBeenCalledWith('Nagranie zapisane: sesja.');
    });

    it('discards', () => {
        const requests = fakeManager('sesja');
        run('/nagrywaj_anuluj');
        expect(requests).toEqual([{ action: 'stop', save: false }]);
        expect(client.println).toHaveBeenCalledWith('Nagranie odrzucone: sesja.');
    });

    it('says so when nothing is recording', () => {
        fakeManager(null);
        run('/nagrywaj_stop');
        expect(client.println).toHaveBeenCalledWith('Nic sie nie nagrywa.');
    });
});
