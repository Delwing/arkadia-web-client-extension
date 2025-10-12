import initAttackBeep from '../src/scripts/attackBeep';
import Triggers, {stripAnsiCodes} from '../src/Triggers';
import {findClosestColor} from '../src/Colors';
import {loadPeople} from '../src/peopleLoader';
import services from '../src/runtime/service-registry';
import { setCurrentCharacter } from '../src/storage';

jest.mock('../src/peopleLoader', () => ({
  loadPeople: jest.fn(),
}));

const loadPeopleMock = loadPeople as jest.MockedFunction<typeof loadPeople>;

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

  beforeEach(async () => {
    loadPeopleMock.mockReset().mockResolvedValue(MOCK_PEOPLE);
    localStorage.clear();
    setCurrentCharacter('');
    await services.settings.update({ enemyGuilds: [] } as any);
    client = new FakeClient();
    initAttackBeep((client as unknown) as any);
    await loadPeopleMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    await services.settings.update({ enemyGuilds: ['CKN'] } as any);
    const lastCall = loadPeopleMock.mock.results[loadPeopleMock.mock.results.length - 1];
    await lastCall?.value;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await services.settings.update({ enemyGuilds: [] } as any);
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
