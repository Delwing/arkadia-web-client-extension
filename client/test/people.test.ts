import People from '../src/People';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { color, RESET, findClosestColor } from '../src/Colors';
import type { PersonEntry } from '../src/types/people';
import { PeopleDataCatalog, registerPeopleLoader } from '../src/runtime/data';

const MOCK_PEOPLE: PersonEntry[] = [
  { name: 'Eamon', description: 'wysoki mezczyzna', guild: 'CKN' },
  { name: 'Eamon', description: 'wysoki mezczyzna w kapturze', guild: 'CKN' },
  { name: 'Krasn', description: 'krepy lysy krasnolud', guild: 'CKN' },
  { name: 'Mara', description: 'niska kobieta', guild: 'NPC' },
  { name: 'w', description: 'koscisty mezczyzna', guild: 'GP' },
];

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
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

describe('people triggers enemy highlight', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(async () => {
    const catalog = await createCatalogWithPeople(MOCK_PEOPLE);
    client = new FakeClient();
    new People((client as unknown) as any, catalog);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    const handler = client.addEventListener.mock.calls[0]?.[1];
    if (handler) {
      handler({ detail: { guilds: [], enemyGuilds: ['CKN'] } } as any);
    }
  });

  test('colors enemy description red', () => {
    const result = parse('Widzisz wysoki mezczyzna tutaj.');
    const red = findClosestColor('#ff0000');
    const highlight = color(red);
    expect(result.split(highlight).length - 1).toBe(2);
    expect(result).toContain(color(red) + '(Eamon CKN)' + RESET);
    expect(stripAnsiCodes(result)).toContain('(Eamon CKN)');
  });

  test('colors enemy name red without suffix', () => {
    const result = parse('Eamon wita cie.');
    const red = findClosestColor('#ff0000');
    expect(result).toContain(color(red) + 'Eamon' + RESET);
    expect(stripAnsiCodes(result)).not.toContain('(Eamon CKN)');
  });

  test('enemy name is highlighted only once despite duplicates', () => {
    const result = parse('Eamon wita cie.');
    const red = findClosestColor('#ff0000');
    const highlight = color(red) + 'Eamon' + RESET;
    const parts = result.split(highlight);
    expect(parts.length - 1).toBe(1);
  });

  test('ignores very short enemy names to avoid false positives', () => {
    const result = parse('spotykasz w drodze przyjaciela.');
    const red = findClosestColor('#ff0000');
    expect(result).not.toContain(color(red));
  });

  test("doesn't color description when followed by chaosu", () => {
    const result = parse('Widzisz krepy lysy krasnolud chaosu tutaj.');
    const red = findClosestColor('#ff0000');
    expect(result).not.toContain(color(red));
    expect(stripAnsiCodes(result)).not.toContain('(Krasn CKN)');
  });
});

describe('people triggers guild highlight', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  type SettingsEvent = { detail: { guilds: string[]; enemyGuilds: string[]; guildColors?: Record<string, string> } };
  let settingsHandler: ((event: SettingsEvent) => void) | undefined;

  beforeEach(async () => {
    const catalog = await createCatalogWithPeople(MOCK_PEOPLE);
    client = new FakeClient();
    new People((client as unknown) as any, catalog);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    settingsHandler = client.addEventListener.mock.calls[0]?.[1] as ((event: SettingsEvent) => void);
  });

  const emitSettings = (detail: { guilds: string[]; enemyGuilds: string[]; guildColors?: Record<string, string> }) => {
    settingsHandler?.({ detail } as any);
  };

  test('adds name after description without red color', () => {
    emitSettings({ guilds: ['CKN'], enemyGuilds: [], guildColors: { CKN: '#00ff00' } });
    const result = parse('Widzisz wysoki mezczyzna tutaj.');
    const red = findClosestColor('#ff0000');
    const green = findClosestColor('#00ff00');
    expect(result).not.toContain(color(red));
    expect(result).toContain(color(green));
    expect(stripAnsiCodes(result)).toContain('(Eamon CKN)');
  });

  test('adds names for two guild members in the same sentence', () => {
    emitSettings({ guilds: ['CKN'], enemyGuilds: [], guildColors: { CKN: '#00ff00' } });
    const result = parse('Widzisz wysoki mezczyzna oraz krepy lysy krasnolud.');
    const green = findClosestColor('#00ff00');
    const highlight = color(green);
    expect(result.split(highlight).length - 1).toBeGreaterThanOrEqual(2);
    const stripped = stripAnsiCodes(result);
    expect(stripped).toContain('(Eamon CKN)');
    expect(stripped).toContain('(Krasn CKN)');
  });

  test('colors enemy guild member in red', () => {
    emitSettings({ guilds: [], enemyGuilds: ['CKN'], guildColors: {} });
    const result = parse('Widzisz wysoki mezczyzna tutaj.');
    const red = findClosestColor('#ff0000');
    expect(result).toContain(color(red) + 'wysoki mezczyzna' + RESET);
    expect(result).toContain(color(red) + '(Eamon CKN)' + RESET);
  });

  test('colors two enemy guild members in one sentence', () => {
    emitSettings({ guilds: [], enemyGuilds: ['CKN', 'GP'], guildColors: {} });
    const result = parse('Widzisz wysoki mezczyzna i koscisty mezczyzna obok siebie.');
    const red = findClosestColor('#ff0000');
    const stripped = stripAnsiCodes(result);
    expect(stripped).toContain('(Eamon CKN)');
    expect(stripped).toContain('(w GP)');
    expect(result.split(color(red)).length - 1).toBeGreaterThanOrEqual(4);
  });

  test('colors ally and enemy differently when they appear together', () => {
    emitSettings({ guilds: ['CKN'], enemyGuilds: ['GP'], guildColors: { CKN: '#00ff00' } });
    const result = parse('Widzisz wysoki mezczyzna oraz koscisty mezczyzna.');
    const red = findClosestColor('#ff0000');
    const green = findClosestColor('#00ff00');
    expect(result).toContain(color(green) + '(Eamon CKN)' + RESET);
    expect(result).toContain(color(red) + '(w GP)' + RESET);
  });
});
