import initLisica, {formatCode, knockLabel, parseCode} from '@client/scripts/skarbce/lisica';
import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';
import {characterStorage} from '@modules/core/storage';

const NOTE = 'Spotkanie w grocie. Z haslem jak zawsze, aktualnie to: 1-9-5-2. Oczekuje dobrych wiadomosci.';
const ECHO = 'Niewielkie drzwi wydaja z siebie taki dzwiek, jakby ktos pukal.';

class FakeBind {
    printable: string | null = null;
    callback: (() => void) | null = null;

    getPrintable() {
        return this.printable;
    }
}

class FakeClient {
    Triggers = new Triggers({} as any);
    aliases: { pattern: RegExp; callback: Function }[] = [];
    sendCommand = jest.fn();
    println = jest.fn();

    bind = new FakeBind();
    FunctionalBind = {
        set: jest.fn((printable: string | null, callback?: () => void) => {
            this.bind.printable = printable;
            this.bind.callback = callback ?? null;
        }),
        getCategory: () => this.bind,
        clearCategory: jest.fn(() => {
            this.bind.printable = null;
            this.bind.callback = null;
        }),
    };

    line(text: string) {
        this.Triggers.parseLine(new AnsiAwareBuffer(text), 'text');
    }

    run(command: string) {
        for (const alias of this.aliases) {
            const matches = command.match(alias.pattern);
            if (matches) {
                alias.callback(matches);
                return;
            }
        }
        throw new Error(`Brak aliasu dla: ${command}`);
    }

    knocks() {
        return this.sendCommand.mock.calls.filter(call => call[0] === 'zapukaj w drzwi').length;
    }
}

function setup() {
    const client = new FakeClient();
    initLisica(client as any, client.aliases);
    return client;
}

describe('lisica - parsowanie hasla', () => {
    test.each([
        ['1-9-5-2', [1, 9, 5, 2]],
        ['1952', [1, 9, 5, 2]],
        ['1 9 5 2', [1, 9, 5, 2]],
        ['1, 9, 5, 2', [1, 9, 5, 2]],
        ['', []],
    ])('%s', (raw, expected) => {
        expect(parseCode(raw)).toEqual(expected);
    });

    test('formatowanie i opis grupy pukniec', () => {
        expect(formatCode([1, 9, 5, 2])).toBe('1-9-5-2');
        expect(knockLabel(9, 1, 4)).toBe('zapukaj w drzwi x9 (2/4)');
        expect(knockLabel(1, 0, 4)).toBe('zapukaj w drzwi (1/4)');
    });
});

describe('lisica - wystukiwanie', () => {
    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        localStorage.clear();
    });

    test('wiadomosc zapamietuje haslo, alias bez argumentu go uzywa', () => {
        const client = setup();
        client.line(NOTE);

        expect(characterStorage.get('lisica_code')).toBe('1-9-5-2');

        client.run('/lisica');
        expect(client.knocks()).toBe(1);
    });

    test('po odpowiedzi drzwi kolejna grupa trafia na bind', () => {
        const client = setup();
        client.run('/lisica 1-9-5-2');
        expect(client.knocks()).toBe(1);

        client.line(ECHO);
        expect(client.bind.printable).toBe('zapukaj w drzwi x9 (2/4)');

        client.bind.callback!();
        expect(client.knocks()).toBe(10);

        // Kolejna cyfra dopiero po wszystkich dziewieciu odpowiedziach.
        for (let i = 0; i < 8; i++) client.line(ECHO);
        expect(client.bind.printable).toBe('zapukaj w drzwi x9 (2/4)');
        client.line(ECHO);
        expect(client.bind.printable).toBe('zapukaj w drzwi x5 (3/4)');
    });

    test('brakujace odpowiedzi nie blokuja sekwencji', () => {
        const client = setup();
        client.run('/lisica 1952');
        client.line(ECHO);
        client.bind.callback!();

        client.line(ECHO);
        jest.advanceTimersByTime(1500);

        expect(client.bind.printable).toBe('zapukaj w drzwi x5 (3/4)');
    });

    test('ostatnia grupa konczy sekwencje i czysci bind', () => {
        const client = setup();
        client.run('/lisica 11');
        client.line(ECHO);
        expect(client.bind.printable).toBe('zapukaj w drzwi (2/2)');

        client.bind.callback!();
        client.line(ECHO);

        expect(client.bind.printable).toBeNull();
        expect(client.println).toHaveBeenCalled();
    });

    test('stop przerywa sekwencje', () => {
        const client = setup();
        client.run('/lisica 1-9-5-2');
        client.run('/lisica stop');
        client.sendCommand.mockClear();

        client.line(ECHO);
        expect(client.knocks()).toBe(0);
    });

    test('bez zapamietanego hasla tylko podpowiadamy skladnie', () => {
        const client = setup();
        client.run('/lisica');

        expect(client.knocks()).toBe(0);
        expect(client.println).toHaveBeenCalled();
    });
});
