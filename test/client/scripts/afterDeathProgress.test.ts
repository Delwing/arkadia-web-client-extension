import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initAfterDeathProgress from '@client/scripts/afterDeathProgress';
import { IMPROVE_STATES } from '@client/scripts/improveCounter';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const line = (progress: string) =>
    `Twoje cechy sa oslabione po ostatniej smierci. By je odbudowac potrzebujesz zdobyc jeszcze ${progress} postepy.`;

describe('afterDeathProgress', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initAfterDeathProgress(client);
    });

    test('"zadnych" reads as nothing left to regain', () => {
        const [out] = client.onLine(line('zadnych'), 'text');

        expect(out.text).toContain('zadnych [0/15]');
    });

    test.each([
        [IMPROVE_STATES[0], '[0/15]'],
        [IMPROVE_STATES[1], '[1/15]'],
        [IMPROVE_STATES[IMPROVE_STATES.length - 1], `[${IMPROVE_STATES.length - 1}/15]`],
    ])('%s is annotated with %s', (state, expected) => {
        const [out] = client.onLine(line(state), 'text');

        expect(out.text).toContain(`${state} ${expected}`);
    });

    test('the whole line is coloured and the progress phrase stands out', () => {
        const [out] = client.onLine(line('zadnych'), 'text');

        expect(out.toHtml()).toContain('#00ff7f');
        expect(out.toHtml()).toContain('#00bfff');
    });

    test('an unknown progress phrase is left unannotated but still coloured', () => {
        const [out] = client.onLine(line('jakies dziwne'), 'text');

        expect(out.text).toBe(line('jakies dziwne'));
        expect(out.toHtml()).toContain('#00ff7f');
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.toHtml()).not.toContain('#00ff7f');
    });
});
