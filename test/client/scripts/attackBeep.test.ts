import initAttackBeep from '@client/scripts/attackBeep';
import Triggers from '@client/Triggers';
import {refresh, subscribe} from '@modules/data/peopleStore';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';

vi.mock('@modules/data/peopleStore', () => ({
  subscribe: jest.fn(),
  refresh: jest.fn(),
}));

const subscribeMock = subscribe as jest.MockedFunction<typeof subscribe>;
const refreshMock = refresh as jest.MockedFunction<typeof refresh>;

const MOCK_PEOPLE = [
  { name: 'Intia', description: 'wojowniczka', guild: 'CKN' },
  { name: 'Eamon', description: 'wysoki mezczyzna', guild: 'CKN' },
];

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  sendEvent = jest.fn();
}

describe('attack beep triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];

  beforeEach(async () => {
    subscribers.length = 0;
    subscribeMock.mockReset().mockImplementation((listener) => {
      subscribers.push(listener as (snapshot: typeof MOCK_PEOPLE | undefined) => void);
      return () => {
        const index = subscribers.indexOf(listener as (snapshot: typeof MOCK_PEOPLE | undefined) => void);
        if (index >= 0) {
          subscribers.splice(index, 1);
        }
      };
    });
    refreshMock.mockReset().mockImplementation(async () => {
      subscribers.forEach((listener) => listener(MOCK_PEOPLE));
      return MOCK_PEOPLE;
    });
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initAttackBeep((client as unknown) as any);
    await refreshMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    // initialize with enemy guilds so beeping is enabled only for configured guilds
    setTestSettings({ enemyGuilds: ['CKN'] });
    const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
    await lastCall?.value;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    subscribers.length = 0;
    localStorage.clear();
  });

  test('beeps and highlights on attack', () => {
    const result = parse('Intia atakuje cie!');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toBe('attack');
    expect(result.text).toContain('Intia ATAKUJE CIE!');
    // Check that text is colored red
    const segments = (result as any).getSegments();
    const hasRedColor = segments.some((seg: any) =>
      seg.state?.foreground
    );
    expect(hasRedColor).toBe(true);
  });

  test('uppercases selected phrase', () => {
    const line = 'W oczach Eamon rozpala sie swiety ogien nienawisci i z imieniem Morra na ustach rzuca sie do walki z toba!';
    const result = parse(line);
    expect(result.text).toContain('RZUCA SIE DO WALKI Z TOBA');
  });

  test('does not beep on plain phrase trigger', () => {
    const result = parse('atakuje cie!');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(0);
    expect(result.text).toContain('ATAKUJE CIE');
    expect(result?.text.endsWith('!')).toBe(true);
    // Check that text is colored red
    const segments = (result as any).getSegments();
    const hasRedColor = segments.some((seg: any) =>
      seg.state?.foreground
    );
    expect(hasRedColor).toBe(true);
  });
});
