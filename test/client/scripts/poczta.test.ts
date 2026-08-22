import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
import initPoczta, { type MailEntry, type LetterContent } from '@client/scripts/poczta';

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

describe('poczta', () => {
    let client: Client;
    let sent: string[];
    let loaded: { type: string; mails: MailEntry[] }[];
    let letters: LetterContent[];
    let offs: (() => void)[];

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        sent = [];
        loaded = [];
        letters = [];
        // initPoczta subscribes to the global bus and never unsubscribes, so
        // stale handlers from earlier tests re-emit the same command. Assert with
        // `toContain` rather than on exact call counts.
        offs = [
            eventBus.on('sendCommand', (p: any) => { sent.push(p.command); }),
            eventBus.on('poczta.loaded', (p: any) => { loaded.push(p); }),
            eventBus.on('poczta.letter.loaded', (p: any) => { letters.push(p); }),
        ];
        initPoczta(client, client.aliases);
    });

    afterEach(() => offs.forEach(off => off()));

    describe('when idle', () => {
        // The property that matters most: poczta swallows 16 different line
        // shapes, and none of them may be swallowed unless a request is pending.
        test.each([
            'Listy odebrane:',
            '  1.  Temat: Sprawa wagi panstwowej',
            'Nadawca: Ala   2026-08-22',
            'Odbiorca: Bela   2026-08-22',
            'Nie masz zadnych odebranych listow.',
            'List: 5',
            'Od: Ala',
            'Temat: Sprawa',
            'Do: Bela',
            'DW: Cela',
            'Data: 2026-08-22',
            '[2026-08-22 sobota] (aktualny: 5) --',
        ])('%s passes through untouched', (line) => {
            const parts = client.onLine(line, 'text');

            expect(parts).toHaveLength(1);
            expect(parts[0].text).toBe(line);
        });
    });

    describe('/poczta', () => {
        test('opens the popup', async () => {
            let opened = false;
            const off = eventBus.on('poczta.popup.open', () => { opened = true; });

            await client.sendCommand('/poczta');
            off();

            expect(opened).toBe(true);
        });
    });

    describe('fetching a mail list', () => {
        beforeEach(() => {
            eventBus.emit('poczta.fetch', { type: 'odebrane' });
        });

        test('asks the game for the list', () => {
            expect(sent).toContain('listy odebrane');
        });

        test('swallows the listing lines it consumes', () => {
            expect(client.onLine('Listy odebrane:', 'text')).toHaveLength(0);
            expect(client.onLine('  2.  Temat: Druga sprawa', 'text')).toHaveLength(0);
            expect(client.onLine('Nadawca: Bela   2026-08-21', 'text')).toHaveLength(0);
        });

        test('publishes the parsed list once entry 1 arrives', () => {
            client.onLine('Listy odebrane:', 'text');
            client.onLine('  2.  Temat: Druga sprawa', 'text');
            client.onLine('Nadawca: Bela   2026-08-21', 'text');
            client.onLine('  1.  *R*  Temat: Pierwsza sprawa', 'text');
            client.onLine('Nadawca: Ala   2026-08-22', 'text');

            expect(loaded).toHaveLength(1);
            expect(loaded[0].type).toBe('odebrane');
            expect(loaded[0].mails).toEqual([
                { number: 2, isRead: false, subject: 'Druga sprawa', sender: 'Bela', date: '2026-08-21' },
                { number: 1, isRead: true, subject: 'Pierwsza sprawa', sender: 'Ala', date: '2026-08-22' },
            ]);
        });

        test('a sent-mail list uses the recipient line instead', () => {
            client.onLine('Listy wyslane:', 'text');
            client.onLine('  1.  Temat: Do Beli', 'text');
            client.onLine('Odbiorca: Bela   2026-08-22', 'text');

            expect(loaded[0].mails).toEqual([
                { number: 1, isRead: false, subject: 'Do Beli', sender: 'Bela', date: '2026-08-22' },
            ]);
        });

        test('an empty mailbox publishes an empty list', () => {
            expect(client.onLine('Nie masz zadnych odebranych listow.', 'text')).toHaveLength(0);

            expect(loaded).toHaveLength(1);
            expect(loaded[0].mails).toEqual([]);
        });

        test('capture stops after the list completes', () => {
            client.onLine('Listy odebrane:', 'text');
            client.onLine('  1.  Temat: Pierwsza sprawa', 'text');
            client.onLine('Nadawca: Ala   2026-08-22', 'text');

            // The next listing-shaped line is no longer ours.
            const parts = client.onLine('  9.  Temat: Cos innego', 'text');
            expect(parts).toHaveLength(1);
        });

        test('the paged header variant is recognised', () => {
            expect(
                client.onLine('Listy odebrane (prezentowane jest pierwsze 20):', 'text')
            ).toHaveLength(0);
        });
    });

    describe('reading a letter', () => {
        beforeEach(() => {
            eventBus.emit('poczta.read', { number: 5 });
        });

        test('asks the game for the letter and quits the pager', () => {
            expect(sent).toContain('przeczytaj list 5;q');
        });

        function feedLetter(body: string[]) {
            client.onLine('List: 5', 'text');
            client.onLine('Od: Ala', 'text');
            client.onLine('Temat: Sprawa wagi panstwowej', 'text');
            client.onLine('Do: Bela', 'text');
            client.onLine('Data: 2026-08-22', 'text');
            body.forEach(l => client.onLine(l, 'text'));
            client.onLine('[2026-08-22 sobota] (aktualny: 5) --', 'text');
        }

        test('swallows the header lines', () => {
            expect(client.onLine('List: 5', 'text')).toHaveLength(0);
            expect(client.onLine('Od: Ala', 'text')).toHaveLength(0);
            expect(client.onLine('Temat: Sprawa', 'text')).toHaveLength(0);
            expect(client.onLine('Do: Bela', 'text')).toHaveLength(0);
            expect(client.onLine('Data: 2026-08-22', 'text')).toHaveLength(0);
        });

        test('publishes the letter when the pager footer arrives', () => {
            feedLetter(['Witaj przyjacielu.', 'Pozdrawiam.']);

            expect(letters).toHaveLength(1);
            expect(letters[0]).toMatchObject({
                number: 5,
                from: 'Ala',
                subject: 'Sprawa wagi panstwowej',
                to: 'Bela',
                date: '2026-08-22',
                body: ['Witaj przyjacielu.', 'Pozdrawiam.'],
            });
        });

        test('pager padding around the body is trimmed, inner blanks kept', () => {
            feedLetter([' ', 'Witaj.', ' ', 'Pozdrawiam.', ' ']);

            expect(letters[0].body).toEqual(['Witaj.', ' ', 'Pozdrawiam.']);
        });

        test('a wrapped header field is joined onto the previous one', () => {
            client.onLine('List: 5', 'text');
            client.onLine('Od: Ala', 'text');
            client.onLine('Do: Bela,', 'text');
            client.onLine('    Cela', 'text');
            client.onLine('Data: 2026-08-22', 'text');
            client.onLine('[2026-08-22 sobota] (aktualny: 5) --', 'text');

            expect(letters[0].to).toBe('Bela, Cela');
        });

        test('blank padding before the header is swallowed', () => {
            expect(client.onLine(' ', 'text')).toHaveLength(0);
        });

        test('a real error before the header stops capture and is shown', () => {
            const parts = client.onLine('Nie ma takiego listu.', 'text');

            expect(parts).toHaveLength(1);
            expect(parts[0].text).toBe('Nie ma takiego listu.');
            // Capture is off again, so ordinary output survives.
            expect(client.onLine('Jestes lekko zmeczony.', 'text')).toHaveLength(1);
        });

        test('output returns to normal after the letter completes', () => {
            feedLetter(['Witaj.']);

            const parts = client.onLine('Od: Ktos', 'text');
            expect(parts).toHaveLength(1);
        });
    });
});
