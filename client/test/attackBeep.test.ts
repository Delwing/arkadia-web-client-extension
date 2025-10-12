import initAttackBeep from '../src/scripts/attackBeep';
import Triggers, {stripAnsiCodes} from '../src/Triggers';
import {findClosestColor} from '../src/Colors';
import services from '../src/runtime/service-registry';
import { setCurrentCharacter } from '../src/storage';
import type { PersonEntry } from '../src/types/people';
import { PeopleDataCatalog, registerPeopleLoader } from '../src/runtime/data';

const MOCK_PEOPLE: PersonEntry[] = [
  { name: 'Intia', description: 'wojowniczka', guild: 'CKN' },
  { name: 'Eamon', description: 'wysoki mezczyzna', guild: 'CKN' },
];

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  playSound = jest.fn();
  addEventListener = jest.fn();
}

async function createCatalogWithPeople(people: PersonEntry[]): Promise<PeopleDataCatalog> {
  const catalog = new PeopleDataCatalog();
  registerPeopleLoader({
    catalog,
    loader: async () => people,
  });
  await catalog.setPeopleData(people, 'loader');
  return catalog;
}

describe('attack beep triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(async () => {
    const catalog = await createCatalogWithPeople(MOCK_PEOPLE);
    client = new FakeClient();
    localStorage.clear();
    setCurrentCharacter('');
    await services.settings.update({ enemyGuilds: [] } as any);
    initAttackBeep((client as unknown) as any, catalog);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    await services.settings.update({ enemyGuilds: ['CKN'] } as any);
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
