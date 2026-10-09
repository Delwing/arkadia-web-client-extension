import People from '@client/People';
import Triggers from '@client/Triggers';
import { refresh, subscribe, forceRefresh } from '@modules/data/peopleStore';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import {
  clearLocalEvents,
  editPerson,
  getMergedSnapshot,
  makePersonKey,
  setPersonNote,
} from '@modules/data/peopleLoader';
import { setTestSettings } from './helpers/testSettings';

vi.mock('@modules/data/peopleStore', () => ({
  subscribe: jest.fn(),
  refresh: jest.fn(),
  forceRefresh: jest.fn(),
}));

const subscribeMock = subscribe as jest.MockedFunction<typeof subscribe>;
const refreshMock = refresh as jest.MockedFunction<typeof refresh>;
const forceRefreshMock = forceRefresh as jest.MockedFunction<typeof forceRefresh>;

const MOCK_PEOPLE = [
  { name: 'Eamon', description: 'wysoki mezczyzna', guild: 'CKN' },
  { name: 'Eamon', description: 'wysoki mezczyzna w kapturze', guild: 'CKN' },
  { name: 'Mara', description: 'niska kobieta', guild: 'NPC' },
];

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  on = jest.fn();
}

const key = (name: string, description: string) => makePersonKey(name, description);
const noteFor = (name: string, description: string) =>
  getMergedSnapshot()?.find(p => key(p.name, p.description) === key(name, description));

describe('people notes', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;

  beforeEach(async () => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];
    subscribeMock.mockReset().mockImplementation((listener) => {
      subscribers.push(listener as (snapshot: typeof MOCK_PEOPLE | undefined) => void);
      return () => undefined;
    });
    const emit = async () => {
      subscribers.forEach((listener) => listener(MOCK_PEOPLE));
      return MOCK_PEOPLE;
    };
    refreshMock.mockReset().mockImplementation(emit);
    forceRefreshMock.mockReset().mockImplementation(emit);

    client = new FakeClient();
    new People((client as unknown) as any);
    await refreshMock.mock.results[0]?.value;
    clearLocalEvents();
    setTestSettings({ guilds: [], enemyGuilds: [] });
    parse = (line: string, type = 'room.contents.living') =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
  });

  it('stores the note and the show flag on the merged entry', () => {
    setPersonNote(key('Mara', 'niska kobieta'), '  sprzedaje ziola  ', true);

    expect(noteFor('Mara', 'niska kobieta')).toMatchObject({ note: 'sprzedaje ziola', showNoteOnMeet: true });
  });

  it('removes the note when saved empty', () => {
    setPersonNote(key('Mara', 'niska kobieta'), 'sprzedaje ziola', true);
    setPersonNote(key('Mara', 'niska kobieta'), '', true);

    expect(noteFor('Mara', 'niska kobieta')?.note).toBeUndefined();
    expect(noteFor('Mara', 'niska kobieta')?.showNoteOnMeet).toBeFalsy();
  });

  it('keeps the note through an edit, and can clear it on the new key', () => {
    setPersonNote(key('Mara', 'niska kobieta'), 'sprzedaje ziola', true);
    editPerson(key('Mara', 'niska kobieta'), { name: 'Mara', description: 'niska ruda kobieta', guild: 'NPC' });

    expect(noteFor('Mara', 'niska ruda kobieta')?.note).toBe('sprzedaje ziola');

    setPersonNote(key('Mara', 'niska ruda kobieta'), '', false);
    expect(noteFor('Mara', 'niska ruda kobieta')?.note).toBeUndefined();
  });

  it('prints a ticked note on the line after the living line', () => {
    setPersonNote(key('Mara', 'niska kobieta'), 'sprzedaje ziola', true);

    const result = parse('Niska kobieta stoi tutaj.');

    expect(result?.text).toBe('Niska kobieta stoi tutaj.\n✎ Notatka (Mara): sprzedaje ziola');
  });

  it('does not print a note that is not ticked', () => {
    setPersonNote(key('Mara', 'niska kobieta'), 'sprzedaje ziola', false);

    expect(parse('Niska kobieta stoi tutaj.')?.text).toBe('Niska kobieta stoi tutaj.');
  });

  it('only prints notes for the living line', () => {
    setPersonNote(key('Mara', 'niska kobieta'), 'sprzedaje ziola', true);

    expect(parse('Niska kobieta usmiecha sie.', '')?.text).toBe('Niska kobieta usmiecha sie.');
  });

  it('matches an introduced person by name', () => {
    setPersonNote(key('Mara', 'niska kobieta'), 'sprzedaje ziola', true);

    expect(parse('Mara i Eamon.')?.text).toBe('Mara i Eamon.\n✎ Notatka (Mara): sprzedaje ziola');
  });

  it('picks the longest description when one contains another', () => {
    setPersonNote(key('Eamon', 'wysoki mezczyzna'), 'krotki', true);
    setPersonNote(key('Eamon', 'wysoki mezczyzna w kapturze'), 'w kapturze', true);

    expect(parse('Wysoki mezczyzna w kapturze.')?.text)
      .toBe('Wysoki mezczyzna w kapturze.\n✎ Notatka (Eamon): w kapturze');
  });

  it('prints notes in the order people stand in the line, each line of a note on its own', () => {
    setPersonNote(key('Mara', 'niska kobieta'), 'pierwsza\ndruga', true);
    setPersonNote(key('Eamon', 'wysoki mezczyzna'), 'wrog', true);

    expect(parse('Wysoki mezczyzna i niska kobieta.')?.text).toBe(
      'Wysoki mezczyzna i niska kobieta.\n✎ Notatka (Eamon): wrog\n✎ Notatka (Mara): pierwsza\n  druga',
    );
  });
});
