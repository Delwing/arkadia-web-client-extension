import initPoczta from '@client/scripts/poczta';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import eventBus from '@modules/core/eventBus';
import type { LetterContent, MailEntry, MailType } from '@client/scripts/poczta';

/** The two letters a player pasted from a live session, kept byte-for-byte. */
const LETTER_WITH_SCROLL_ART = `
List : 1
Od   : Itamiko
Temat: List
Data : Pn, 31 VIII 2026, 21:16:12

  __
/ \\                                                             .
|  |                                                            |.
_ |                                                            |.
   |                                                            |.
   |   Jaka cena?                                               |.
   |   Mithryl? Zapiski?                                        |.
   |                                                            |.
   |   Itamiko                                                  |.
   |   __|__
   _/__/.

[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- `;

const LETTER_WITH_RECIPIENTS = `
List : 2
Od   : Zutzer
Temat: Pergamin.
Do   : Soroko, Dracco, Tahira, Arcain, Hondur, Eldur, Jaromir i Valur
Data : Pn, 31 VIII 2026, 19:36:55

       Jaka robota sie szykuje?
[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 2) -- `;

describe('poczta', () => {
    let client: { Triggers: Triggers };
    let lists: { type: MailType; mails: MailEntry[] }[];
    let letters: LetterContent[];
    let commands: string[];
    let offs: Array<() => void>;

    beforeEach(() => {
        jest.useFakeTimers();
        // initPoczta subscribes to these and has no way to unsubscribe, so the previous
        // test's listeners have to go before re-initialising or one request is handled
        // several times over. The real client only ever registers its scripts once.
        eventBus.clear('poczta.fetch');
        eventBus.clear('poczta.read');
        client = { Triggers: new Triggers({} as never) };
        // main.ts registers the pager's auto-ENTER before poczta, so poczta never sees the pager line.
        client.Triggers.registerTrigger('ENTER by przejsc dalej', () => {
            eventBus.emit('sendCommand', { command: '' });
            return null;
        });
        initPoczta(client as never, []);
        lists = [];
        letters = [];
        commands = [];
        offs = [
            eventBus.on('poczta.loaded', payload => lists.push(payload as never)),
            eventBus.on('poczta.letter.loaded', payload => letters.push(payload)),
            eventBus.on('sendCommand', payload => commands.push(payload.command)),
        ];
    });

    afterEach(() => {
        offs.forEach(off => off());
        jest.useRealTimers();
    });

    /** Feeds a block of game output line by line and returns the lines that stayed visible. */
    const feed = (block: string) => block
        .split('\n')
        .filter(text => client.Triggers.parseLine(new AnsiAwareBuffer(text), '') !== null);

    describe('index', () => {
        const OLDEST_FIRST = `Listy odebrane:
   3. Temat: Trzeci
Nadawca: Aaa                            Pn, 30 VIII 2026
   2. *R* Temat: Pergamin.
Nadawca: Zutzer                         Pn, 31 VIII 2026
   1. Temat: List
Nadawca: Itamiko                        Pn, 31 VIII 2026`;

        test('captures every entry and hides the index from the output', () => {
            eventBus.emit('poczta.fetch', { type: 'odebrane' });
            expect(commands).toEqual(['listy odebrane']);

            expect(feed(OLDEST_FIRST)).toEqual([]);
            jest.advanceTimersByTime(500);

            expect(lists).toEqual([{
                type: 'odebrane',
                mails: [
                    { number: 3, isRead: false, subject: 'Trzeci', sender: 'Aaa', date: 'Pn, 30 VIII 2026' },
                    { number: 2, isRead: true, subject: 'Pergamin.', sender: 'Zutzer', date: 'Pn, 31 VIII 2026' },
                    { number: 1, isRead: false, subject: 'List', sender: 'Itamiko', date: 'Pn, 31 VIII 2026' },
                ],
            }]);
        });

        test('the line after the index closes it right away', () => {
            eventBus.emit('poczta.fetch', { type: 'odebrane' });
            feed(OLDEST_FIRST);
            expect(lists).toEqual([]);

            expect(feed('Rozgladasz sie po polanie.')).toEqual(['Rozgladasz sie po polanie.']);
            expect(lists[0].mails).toHaveLength(3);

            // Settled: the idle flush must not emit the same index a second time.
            jest.advanceTimersByTime(500);
            expect(lists).toHaveLength(1);
        });

        test('captures an index that runs newest first', () => {
            eventBus.emit('poczta.fetch', { type: 'wyslane' });
            expect(feed(`Listy wyslane:
   1. Temat: List
Odbiorcy: Itamiko                       Pn, 31 VIII 2026
   2. Temat: Pergamin.
Odbiorcy: Soroko, Dracco                Pn, 30 VIII 2026`)).toEqual([]);
            jest.advanceTimersByTime(500);

            expect(lists[0].mails.map(mail => mail.number)).toEqual([1, 2]);
        });

        test('captures an index that does not contain letter 1', () => {
            eventBus.emit('poczta.fetch', { type: 'nieprzeczytane' });
            feed(`Listy nieprzeczytane:
   5. Temat: A
Nadawca: Itamiko                        Pn, 31 VIII 2026
   4. Temat: B
Nadawca: Soroko                         Pn, 30 VIII 2026`);
            jest.advanceTimersByTime(500);

            expect(lists[0].mails.map(mail => mail.number)).toEqual([5, 4]);
        });

        test('accepts the truncated-index header whatever the count declines to', () => {
            for (const header of [
                'Listy wyslane (prezentowane jest pierwsze 20):',
                'Listy wyslane (prezentowane jest pierwszych 50):',
                'Listy wyslane (prezentowanych jest pierwszych 50):',
            ]) {
                lists = [];
                eventBus.emit('poczta.fetch', { type: 'wyslane' });
                feed(`${header}
   1. Temat: List
Odbiorcy: Itamiko                       Pn, 31 VIII 2026`);
                jest.advanceTimersByTime(500);

                expect(lists[0].mails).toHaveLength(1);
            }
        });

        test('keeps a wrapped recipient list from cutting the index short', () => {
            eventBus.emit('poczta.fetch', { type: 'wyslane' });
            expect(feed(`Listy wyslane:
   2. Temat: Pergamin.
Odbiorcy: Soroko, Dracco, Tahira, Arcain, Hondur, Eldur,
          Jaromir i Valur                Pn, 31 VIII 2026
   1. Temat: List
Odbiorcy: Itamiko                        Pn, 30 VIII 2026`)).toEqual([]);
            jest.advanceTimersByTime(500);

            expect(lists[0].mails.map(mail => mail.number)).toEqual([2, 1]);
        });

        test('reports an empty folder', () => {
            eventBus.emit('poczta.fetch', { type: 'wyslane' });
            expect(feed('Nie masz zadnych wyslanych listow.')).toEqual([]);

            expect(lists).toEqual([{ type: 'wyslane', mails: [] }]);
        });

        test('stops waiting when the game never prints a recognisable index', () => {
            eventBus.emit('poczta.fetch', { type: 'wyslane' });
            jest.advanceTimersByTime(5000);

            expect(lists).toEqual([{ type: 'wyslane', mails: [] }]);
        });

        test('leaves the output alone once a request is settled', () => {
            eventBus.emit('poczta.fetch', { type: 'odebrane' });
            feed(OLDEST_FIRST);
            jest.advanceTimersByTime(500);

            const later = `   7. Temat: Cos innego
Nadawca: Ktos                           Pn, 31 VIII 2026`;
            expect(feed(later)).toEqual(later.split('\n'));
        });
    });

    describe('reading a letter', () => {
        test('parses a letter wrapped in scroll art', () => {
            eventBus.emit('poczta.read', { number: 1 });
            expect(commands).toEqual(['przeczytaj list 1']);

            expect(feed(LETTER_WITH_SCROLL_ART)).toEqual([]);
            // The reader's prompt is what closes it, not a `q` sent up front.
            expect(commands).toEqual(['przeczytaj list 1', 'q']);

            expect(letters).toHaveLength(1);
            expect(letters[0]).toMatchObject({
                number: 1,
                from: 'Itamiko',
                subject: 'List',
                to: '',
                cc: '',
                date: 'Pn, 31 VIII 2026, 21:16:12',
            });
            expect(letters[0].body[0]).toBe('  __');
            expect(letters[0].body).toContain('   |   Mithryl? Zapiski?                                        |.');
            expect(letters[0].body[letters[0].body.length - 1]).toBe('   _/__/.');
        });

        test('parses a letter addressed to several people', () => {
            eventBus.emit('poczta.read', { number: 2 });
            expect(feed(LETTER_WITH_RECIPIENTS)).toEqual([]);

            expect(letters[0]).toMatchObject({
                number: 2,
                from: 'Zutzer',
                subject: 'Pergamin.',
                to: 'Soroko, Dracco, Tahira, Arcain, Hondur, Eldur, Jaromir i Valur',
                date: 'Pn, 31 VIII 2026, 19:36:55',
                body: ['       Jaka robota sie szykuje?'],
            });
        });

        test('gives the letter up and stops swallowing output when the pager prompt never lands', () => {
            eventBus.emit('poczta.read', { number: 1 });
            feed(`
List : 1
Od   : Itamiko
Temat: List
Data : Pn, 31 VIII 2026, 21:16:12

Jaka cena?`);
            expect(letters).toEqual([]);

            jest.advanceTimersByTime(5000);
            expect(letters[0]).toMatchObject({ number: 1, body: ['Jaka cena?'] });
            expect(feed('Rozgladasz sie po polanie.')).toEqual(['Rozgladasz sie po polanie.']);
        });

        test('pages through a long letter before closing the reader', () => {
            eventBus.emit('poczta.read', { number: 6 });
            const page1 = Array.from({ length: 5 }, (_, i) => `Linia ${i + 1}`);
            const page2 = Array.from({ length: 3 }, (_, i) => `Linia ${i + 6}`);
            expect(feed(`
List : 6
Od   : Peril
Temat: Dlugi
Data : Pn, 31 VIII 2026, 21:16:12

${page1.join('\n')}
[linia 60/68 - ENTER by przejsc dalej, q by przerwac, ? by uzyskac pomoc]`)).toEqual([]);
            // ENTER goes to the pager; a `q` now would stop the paging and leave the reader open.
            expect(commands).toEqual(['przeczytaj list 6', '']);

            // The next page is a round trip away; the letter must not be cut off meanwhile.
            jest.advanceTimersByTime(2000);
            expect(letters).toEqual([]);

            expect(feed(`${page2.join('\n')}
[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 6) -- `)).toEqual([]);
            expect(commands).toEqual(['przeczytaj list 6', '', 'q']);
            expect(letters).toHaveLength(1);
            expect(letters[0]).toMatchObject({ number: 6, subject: 'Dlugi', body: [...page1, ...page2] });
            expect(feed('Rozgladasz sie po polanie.')).toEqual(['Rozgladasz sie po polanie.']);
        });

        test('releases the output when the letter cannot be read', () => {
            eventBus.emit('poczta.read', { number: 9 });
            expect(feed('Nie ma takiego listu.')).toEqual(['Nie ma takiego listu.']);
            expect(feed('Rozgladasz sie po polanie.')).toEqual(['Rozgladasz sie po polanie.']);
            expect(letters).toEqual([]);
        });
    });

    describe('index listed by the player', () => {
        const UNREAD = `Listy nieprzeczytane:
 3. Temat: wyprawa
Nadawca: Borwin                         Pt, 16 X 2026, 09:12:40
 2. Temat: Zbroja
Nadawca: Lindra                         Pt, 16 X 2026, 18:03:11
 1. Temat: spotkanie
Nadawca: Lindra                          S, 17 X 2026, 20:45:02`;

        const parse = (block: string) => block
            .split('\n')
            .map(text => client.Triggers.parseLine(new AnsiAwareBuffer(text), ''));
        const linkOf = (line: AnsiAwareBuffer | null) =>
            line?.getSegments().find(segment => segment.state?.hyperlink)?.state?.hyperlink;

        /** The text under the line's link. */
        const linkedTextOf = (line: AnsiAwareBuffer | null) =>
            line?.getSegments().find(segment => segment.state?.hyperlink)?.text;

        test('stays visible and links each subject to its letter', () => {
            const lines = parse(UNREAD);
            expect(lines.map(line => line?.text)).toEqual(UNREAD.split('\n'));
            expect(lists).toEqual([]);

            const links = lines.map(linkOf);
            expect(links.map(link => link?.title)).toEqual([
                undefined, 'przeczytaj list 3', undefined, 'przeczytaj list 2', undefined, 'przeczytaj list 1', undefined,
            ]);
            expect(linkedTextOf(lines[1])).toBe('wyprawa');

            links[3]!.onClick!(new MouseEvent('click'));
            expect(commands).toEqual(['przeczytaj list 2']);
        });

        test('received mail gets links as well', () => {
            const lines = parse(`Listy odebrane:
   2. *R* Temat: Pergamin.
Nadawca: Zutzer                         Pn, 31 VIII 2026`);
            expect(linkOf(lines[1])?.title).toBe('przeczytaj list 2');
            expect(linkedTextOf(lines[1])).toBe('Pergamin.');
        });

        test('an entry-like line after the index is left alone', () => {
            parse(UNREAD);
            const [after, numbered] = parse('Rozgladasz sie po polanie.\n 1. Temat: cos');
            expect(linkOf(after)).toBeUndefined();
            expect(linkOf(numbered)).toBeUndefined();
        });
    });
});
