import { PluginApiImpl } from '@client/PluginApi';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

function setup() {
    const triggers = new Triggers({} as never);
    const api = new PluginApiImpl({ Triggers: triggers } as never, 'test/wait');
    const push = (text: string) => triggers.parseLine(new AnsiAwareBuffer(text), 'text');
    const triggerCount = () => (triggers as unknown as { triggers: Map<string, unknown> }).triggers.size;
    return { api, push, triggerCount };
}

describe('api.triggers.waitFor', () => {
    afterEach(() => jest.useRealTimers());

    test('resolves with the first alternative that matches and leaves the line alone', async () => {
        const { api, push } = setup();
        const wait = api.triggers.waitFor([/^Drzwi sa zamkniete na klucz\.$/, /^Otwierasz (.*)\.$/]);
        const out = push('Otwierasz ciezkie debowe drzwi.');
        await expect(wait).resolves.toMatchObject({ index: 1, line: 'Otwierasz ciezkie debowe drzwi.' });
        expect((await wait).match[1]).toBe('ciezkie debowe drzwi');
        expect(out?.text).toBe('Otwierasz ciezkie debowe drzwi.');
    });

    test('removes all its triggers once settled', async () => {
        const { api, push, triggerCount } = setup();
        const wait = api.triggers.waitFor([/^a$/, /^b$/, /^c$/]);
        expect(triggerCount()).toBe(3);
        push('b');
        await wait;
        expect(triggerCount()).toBe(0);
    });

    test('accepts a single pattern', async () => {
        const { api, push } = setup();
        const wait = api.triggers.waitFor('Zamykasz');
        push('Zamykasz woreczek.');
        await expect(wait).resolves.toMatchObject({ index: 0 });
    });

    test('rejects with a TimeoutError and cleans up', async () => {
        jest.useFakeTimers();
        const { api, triggerCount } = setup();
        const wait = api.triggers.waitFor(/^x$/, { timeout: 500 });
        const assertion = expect(wait).rejects.toMatchObject({ name: 'TimeoutError' });
        jest.advanceTimersByTime(500);
        await assertion;
        expect(triggerCount()).toBe(0);
    });

    test('rejects when the signal aborts, and a later line no longer resolves it', async () => {
        const { api, push, triggerCount } = setup();
        const controller = new AbortController();
        const wait = api.triggers.waitFor(/^x$/, { signal: controller.signal });
        controller.abort();
        await expect(wait).rejects.toMatchObject({ name: 'AbortError' });
        expect(triggerCount()).toBe(0);
        push('x');
    });

    test('rejects at once for an already aborted signal', async () => {
        const { api, triggerCount } = setup();
        const controller = new AbortController();
        controller.abort(new Error('stop'));
        await expect(api.triggers.waitFor(/^x$/, { signal: controller.signal })).rejects.toThrow('stop');
        expect(triggerCount()).toBe(0);
    });
});
