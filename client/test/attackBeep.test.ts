import initAttackBeep from '../src/scripts/attackBeep';
import Triggers, {stripAnsiCodes} from '../src/Triggers';
import {findClosestColor} from '../src/Colors';
import {refresh, subscribe} from '../src/peopleStore';

jest.mock('../src/peopleStore', () => ({
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
  playSound = jest.fn();
  addEventListener = jest.fn();
}

describe('attack beep triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
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
    client = new FakeClient();
    initAttackBeep((client as unknown) as any);
    await refreshMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    // initialize with enemy guilds so beeping is enabled only for configured guilds
    const handler = client.addEventListener.mock.calls[0]?.[1];
    if (handler) {
      handler({ detail: { enemyGuilds: ['CKN'] } } as any);
    }
    const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
    await lastCall?.value;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    subscribers.length = 0;
  });

  test('beeps and highlights on attack', () => {
    const result = parse('Intia atakuje cie!');
    expect(client.playSound).toHaveBeenCalledTimes(1);
    const prefix = `\x1B[22;38;5;${findClosestColor('#ff0000')}m`;
    expect(result.startsWith(prefix)).toBe(true);
    expect(result).toContain('Intia ATAKUJE CIE!');
    expect(result.endsWith('\x1B[0m')).toBe(true);
  });

  test('uppercases selected phrase', () => {
    const line = 'W oczach Eamon rozpala sie swiety ogien nienawisci i z imieniem Morra na ustach rzuca sie do walki z toba!';
    const result = parse(line);
    expect(result).toContain('RZUCA SIE DO WALKI Z TOBA');
  });

  test('does not beep on plain phrase trigger', () => {
    const result = parse('atakuje cie!');
    expect(client.playSound).not.toHaveBeenCalled();
    const prefix = `\x1B[22;38;5;${findClosestColor('#ff0000')}m`;
    expect(result.startsWith(prefix)).toBe(true);
    expect(result).toContain('ATAKUJE CIE');
    expect(result.includes('\x1B[0m')).toBe(true);
    expect(stripAnsiCodes(result).endsWith('!')).toBe(true);
    expect(result.endsWith('\x1B[0m')).toBe(true);
  });
});
