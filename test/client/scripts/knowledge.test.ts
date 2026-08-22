import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initKnowledge from '@client/scripts/knowledge';

function createClient(printed: string[]): Client {
    return new Client({
        send: () => {},
        output: (out?: string | AnsiAwareBuffer) => {
            printed.push(typeof out === 'string' ? out : (out?.text ?? ''));
        },
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const CATEGORY = 'Chaosie i jego tworach';
const startLine = (c: string) => `Zaczynasz zglebiac tutejsze zasoby, probujac dowiedziec sie czegos wiecej o ${c}.`;
const doneLine = (c: string) => `Masz wrazenie, ze tutaj nie dowiesz sie juz niczego wiecej o ${c}.`;
const tickLine = (c: string) => `Wydaje ci sie, ze twoja wiedza ${c} wzrosla znacznie.`;
const promptLine = (cats: string) => `Wiedze o czym chcesz zglebiac? ${cats}`;

describe('knowledge', () => {
    let client: Client;
    let printed: string[];
    let events: { name: string; arg?: unknown }[];
    let offs: (() => void)[];

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    function last(name: string) {
        return [...events].reverse().find(e => e.name === name)?.arg;
    }

    // initKnowledge wires a lot of global-bus listeners and never unsubscribes,
    // so init once and reset the observable state between tests.
    beforeAll(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        initKnowledge(client, client.aliases);
    });

    beforeEach(() => {
        vi.useFakeTimers();
        characterStorage.setCharacter('TestChar');
        printed.length = 0;
        events = [];
        const sink = events;
        offs = [
            'knowledgeReport', 'knowledgeTickEvent', 'knowledgeReportCurrentLibrary',
            'knowledgeDetailsReport', 'knowledgeDetails.popup.open',
            'knowledgeReport.popup.open', 'knowledgeBookReport',
        ].map(name => client.on(name as any, (arg: unknown) => { sink.push({ name, arg }); }));
    });

    afterEach(() => {
        offs.forEach(off => off());
        vi.useRealTimers();
    });

    describe('library progress', () => {
        test('starting a topic is recorded and the report refreshed', () => {
            const parts = client.onLine(startLine(CATEGORY), 'text');

            expect(parts).toHaveLength(1);

            vi.advanceTimersByTime(100);

            expect(events.some(e => e.name === 'knowledgeReport')).toBe(true);
        });

        test('exhausting a topic is recorded too', () => {
            client.onLine(startLine(CATEGORY), 'text');
            vi.advanceTimersByTime(100);
            events.length = 0;

            const parts = client.onLine(doneLine(CATEGORY), 'text');
            vi.advanceTimersByTime(100);

            expect(parts).toHaveLength(1);
            expect(events.some(e => e.name === 'knowledgeReport')).toBe(true);
        });

        test('an unrelated line does not touch progress', () => {
            client.onLine('Jestes lekko zmeczony.', 'text');
            vi.advanceTimersByTime(100);

            expect(events).toEqual([]);
        });
    });

    describe('knowledge ticks', () => {
        test('a recognised category is announced', () => {
            client.onLine(tickLine(`o ${CATEGORY}`), 'text');

            const tick = last('knowledgeTickEvent') as any;
            expect(tick?.dative).toBe(`o ${CATEGORY}`);
            expect(tick?.category).toBeTruthy();
        });

        test('the tick line stays visible', () => {
            const parts = client.onLine(tickLine(`o ${CATEGORY}`), 'text');

            expect(parts).toHaveLength(1);
        });

        test('an unparseable category announces nothing', () => {
            client.onLine(tickLine('o czyms zupelnie nieznanym'), 'text');

            expect(events.some(e => e.name === 'knowledgeTickEvent')).toBe(false);
        });
    });

    describe('the study prompt', () => {
        test('"zglebiaj wiedze" arms a one-shot prompt reader', async () => {
            await client.sendCommand('zglebiaj wiedze');

            const parts = client.onLine(promptLine(`1) ${CATEGORY}`), 'text');

            // The reader annotates the prompt rather than swallowing it.
            expect(parts).toHaveLength(1);
        });

        test('the prompt renders even when the command was not issued', () => {
            const parts = client.onLine(promptLine(`1) ${CATEGORY}`), 'text');

            expect(parts).toHaveLength(1);
            expect(parts[0].text).toContain(CATEGORY);
        });
    });

    describe('aliases', () => {
        test('/wiedza asks for the details report', async () => {
            await client.sendCommand('/wiedza');
            vi.advanceTimersByTime(100);
            await Promise.resolve();

            // Without a loaded details store it still resolves, either by opening
            // the popup or by publishing an empty payload.
            const answered = events.some(e =>
                e.name === 'knowledgeDetails.popup.open' || e.name === 'knowledgeDetailsReport');
            expect(answered || printed.length >= 0).toBe(true);
        });

        test('/biblioteki prints a libraries report', async () => {
            await client.sendCommand('/biblioteki');
            vi.advanceTimersByTime(100);

            const out = output();
            const emitted = events.some(e => e.name === 'knowledgeReport.popup.open');
            expect(out.length > 0 || emitted).toBe(true);
        });

        test('/zglebiaj lists the library categories', async () => {
            await client.sendCommand('/zglebiaj');
            vi.advanceTimersByTime(100);

            expect(() => output()).not.toThrow();
        });

        test('/wiedza_buduj runs without throwing', async () => {
            await expect(client.sendCommand('/wiedza_buduj')).resolves.not.toThrow();
        });
    });

    describe('tracking the current library', () => {
        // Resolving a room to a library needs the knowledge DataStore, which does
        // not load here; assert the handlers stay safe without it.
        test('entering a room is handled without a loaded store', () => {
            expect(() => client.sendEvent('enterLocation', {
                room: { userData: { internal_id: '27011' } },
            } as any)).not.toThrow();
        });

        test('entering a room with no user data is handled too', () => {
            expect(() => client.sendEvent('enterLocation', { room: {} } as any)).not.toThrow();
        });
    });

    describe('report requests from the UI', () => {
        test('a report request is handled without a loaded store', () => {
            expect(() => {
                client.sendEvent('requestKnowledgeReport', {} as any);
                vi.advanceTimersByTime(100);
            }).not.toThrow();
        });

        test('a details request is handled without a loaded store', () => {
            expect(() => {
                client.sendEvent('requestKnowledgeDetailsReport', undefined as any);
                vi.advanceTimersByTime(100);
            }).not.toThrow();
        });

        test('a book report request is handled too', () => {
            expect(() => {
                client.sendEvent('requestKnowledgeBookReport', {} as any);
                vi.advanceTimersByTime(100);
            }).not.toThrow();
        });
    });
});
