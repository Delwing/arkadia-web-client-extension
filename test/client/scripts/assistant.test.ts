import initAssistant from '@client/scripts/assistant';
import eventBus from '@modules/core/eventBus';
import { characterStorage } from '@modules/core/storage';

class FakeClient {
    print = jest.fn();
    println = jest.fn();
}

describe('/pomoc alias', () => {
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

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = new FakeClient();
        aliases = [];
        initAssistant(client as unknown as any, aliases);
        jest.clearAllMocks();
    });

    it('opens the panel with no payload', () => {
        const handler = jest.fn();
        const off = eventBus.on('assistant.popup.open', handler);

        expect(run('/pomoc')).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toBeUndefined();

        off();
    });

    it('passes the question through', () => {
        const handler = jest.fn();
        const off = eventBus.on('assistant.popup.open', handler);

        expect(run('/pomoc  jak ustawic trigger na zabicie? ')).toBe(true);
        expect(handler).toHaveBeenCalledWith({ question: 'jak ustawic trigger na zabicie?' });

        off();
    });

    it('tells the user when no UI is listening', () => {
        run('/pomoc');
        expect(client.print).toHaveBeenCalledWith(
            expect.stringContaining('Panel asystenta jest niedostepny'),
        );
    });

    it('does not print when a UI handled the event', () => {
        const off = eventBus.on('assistant.popup.open', () => undefined);
        run('/pomoc');
        expect(client.print).not.toHaveBeenCalled();
        off();
    });
});
