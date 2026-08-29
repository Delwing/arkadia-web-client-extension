import { describe, test, expect, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import initWhoCount from '@client/scripts/whoCount';
import initMove from '@client/scripts/move';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => true,
    });
}

describe('triggers match the line as the MUD sent it', () => {
    test('a prefix inserted by a multiline trigger does not break an anchored single-line trigger', () => {
        const client = createClient();
        const seen: string[] = [];

        client.Triggers.registerMultilineTrigger(/^Header:\n([\s\S]+)$/, line => {
            // Mimics whoCount decorating a name inside the captured body: the marker
            // lands at the start of the second line and shifts every anchor on it.
            line.insert(line.text.indexOf('\n') + 1, '+ ', {});
            return line;
        });

        client.Triggers.registerTrigger(/^Wraz z (?<who>\w+) jedziesz\.$/, (line, matches) => {
            seen.push(matches.groups!.who);
            return line;
        });

        const out = client.onLine('Header:\nWraz z Wexlinem jedziesz.', 'text');

        expect(seen).toEqual(['Wexlinem']);
        // The decoration still reaches the screen — only matching is insulated from it.
        expect(out.map(b => b.text).join('\n')).toBe('Header:\n+ Wraz z Wexlinem jedziesz.');
    });

    test('trigger callbacks receive the original text, not the rewritten one', () => {
        const client = createClient();
        let originalLine: string | undefined;

        client.Triggers.registerMultilineTrigger(/^Kot$/, line => {
            line.insert(0, '>> ', {});
            return line;
        });
        client.Triggers.registerTrigger(/Kot/, (line, _matches, _type, original) => {
            originalLine = original;
            return line;
        });

        client.onLine('Kot', 'text');

        expect(originalLine).toBe('Kot');
    });

    test('a multiline trigger that changes the line count falls back to the rewritten text', () => {
        const client = createClient();
        const seen: string[] = [];

        client.Triggers.registerMultilineTrigger(/^Jeden$/, () => {
            return new AnsiAwareBuffer('Jeden\nDwa');
        });
        client.Triggers.registerTrigger(/^Dwa$/, line => {
            seen.push(line.text);
            return line;
        });

        client.onLine('Jeden', 'text');

        // No 1:1 mapping exists for a line the MUD never sent, so it matches its own text.
        expect(seen).toEqual(['Dwa']);
    });

    test('a rewrite by an earlier single-line trigger does not hide the line from a later one', () => {
        const client = createClient();
        const seen: string[] = [];

        client.Triggers.registerTrigger(/^Idziesz na polnoc\.$/, line => {
            line.insert(0, '* ', {});
            return line;
        });
        client.Triggers.registerTrigger(/^Idziesz na (?<dir>\w+)\.$/, (line, matches) => {
            seen.push(matches.groups!.dir);
            return line;
        });

        client.onLine('Idziesz na polnoc.', 'text');

        expect(seen).toEqual(['polnoc']);
    });

    test('token triggers also match the original text after a single-line trigger rewrote it', () => {
        const client = createClient();
        const seen: string[] = [];

        client.Triggers.registerTrigger(/Draveth/, line => {
            line.clear();
            line.append('nic tu nie ma');
            return line;
        });
        client.Triggers.registerTokenTrigger('Draveth', (line, matches) => {
            seen.push(matches[0]);
            return line;
        });

        client.onLine('Draveth przybywa.', 'text');

        expect(seen).toEqual(['Draveth']);
    });
});

describe('a throwing trigger costs only itself', () => {
    test('the line survives and later triggers still run', () => {
        const client = createClient();
        const seen: string[] = [];
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        client.Triggers.registerTrigger(/Kot/, () => {
            throw new Error('boom');
        });
        client.Triggers.registerTrigger(/^Kot siedzi\.$/, line => {
            seen.push(line.text);
            return line;
        });

        const out = client.onLine('Kot siedzi.', 'text');

        expect(seen).toEqual(['Kot siedzi.']);
        expect(out.map(b => b.text)).toEqual(['Kot siedzi.']);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    test('children of a throwing trigger still run', () => {
        const client = createClient();
        const seen: string[] = [];
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        const parent = client.Triggers.registerTrigger(/^Kot/, () => {
            throw new Error('boom');
        });
        parent.registerChild(/siedzi/, line => {
            seen.push('child');
            return line;
        });

        client.onLine('Kot siedzi.', 'text');

        expect(seen).toEqual(['child']);
        consoleError.mockRestore();
    });

    test('a throwing match function is treated as no match', () => {
        const client = createClient();
        const fired: string[] = [];
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        client.Triggers.registerTrigger(() => {
            throw new Error('boom');
        }, line => {
            fired.push('should not fire');
            return line;
        });
        client.Triggers.registerTrigger(/^Kot siedzi\.$/, line => {
            fired.push('ok');
            return line;
        });

        client.onLine('Kot siedzi.', 'text');

        expect(fired).toEqual(['ok']);
        consoleError.mockRestore();
    });

    test('repeated faults from one trigger stop being logged', () => {
        const client = createClient();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        client.Triggers.registerTrigger(/Kot/, () => {
            throw new Error('boom');
        }, 'noisy');

        for (let i = 0; i < 10; i++) {
            client.onLine('Kot siedzi.', 'text');
        }

        // Three full reports plus the one-off suppression notice.
        expect(consoleError).toHaveBeenCalledTimes(4);
        expect(String(consoleError.mock.calls[3][0])).toContain('suppressing further faults');
        consoleError.mockRestore();
    });
});

describe('the kto packet that swallowed a carriage move line', () => {
    const HEADER = 'Sposrod czterdziestu trzech osob przebywajacych obecnie w swiecie Arkadii, znane tobie to:';
    const NAMES = [
        'Zorlan     Brackov    Yendrel    Xolmir     Fenwar     Astrilo',
        'Drevos     Halven     Corvath    Wexlin     Melgrath   ',
        'Ravik      Solmyr     Trevon     Nyxora     Groskar    ',
    ];
    const CARRIAGE = 'Wraz z Wexlinem i dojrzalym malomownym mezczyzna jedziesz duzym dwuosiowym dylizansem na poludniowy-wschod.';

    test('the map still follows when the move line arrives in the same frame as a kto reply', () => {
        const client = createClient();
        const followMove = vi.fn();
        (client as any).Map = { followMove };
        initWhoCount(client);
        initMove(client);

        // Seed the previous name set so the second reply decorates new arrivals.
        client.onLine([HEADER, ...NAMES].join('\n'), 'text');
        followMove.mockClear();

        const out = client.onLine([HEADER, ...NAMES, CARRIAGE].join('\n'), 'text');

        expect(followMove).toHaveBeenCalledWith('poludniowy-wschod');
        // The reply body now ends at the first line with a period, so the move line is
        // neither treated as a new arrival nor decorated.
        expect(out.map(b => b.text).join('\n')).toContain(`\n${CARRIAGE}`);
    });

    test('the move line is not remembered as a player who then "left"', () => {
        const client = createClient();
        (client as any).Map = { followMove: vi.fn() };
        initWhoCount(client);

        client.onLine([HEADER, ...NAMES, CARRIAGE].join('\n'), 'text');
        const out = client.onLine([HEADER, ...NAMES].join('\n'), 'text');

        expect(out.map(b => b.text).join('\n')).not.toContain('Zakonczyli');
    });

    test('Zakonczyli lands at the end of the reply, not after the line that shared the frame', () => {
        const client = createClient();
        (client as any).Map = { followMove: vi.fn() };
        initWhoCount(client);

        client.onLine([HEADER, ...NAMES].join('\n'), 'text');
        const out = client.onLine([HEADER, NAMES[0], NAMES[1], CARRIAGE].join('\n'), 'text');

        const text = out.map(b => b.text).join('\n');
        expect(text).toContain('Zakonczyli: ');
        // Ravik's row dropped out of the reply, so its names are the ones that left.
        expect(text).toContain('Solmyr');
        expect(text.indexOf('Zakonczyli: ')).toBeLessThan(text.indexOf(CARRIAGE));
    });
});
