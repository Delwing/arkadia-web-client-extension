import People from '../src/People';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { color, RESET, findClosestColor } from '../src/Colors';
import { dataCatalog } from '../src/dataCatalog/catalogInstance';
import { DataCatalogStore } from '../src/dataCatalog/DataCatalog';
import { PeopleCollection } from '../src/dataCatalog/entities';
import appEventBus from '../src/events/app-event-bus';

jest.mock('../src/dataCatalog/catalogInstance', () => ({
  dataCatalog: {
    getPeopleStore: jest.fn(),
  },
}));

const dataCatalogMock = dataCatalog as jest.Mocked<typeof dataCatalog>;
const getPeopleStoreMock = dataCatalogMock.getPeopleStore;

const MOCK_PEOPLE: PeopleCollection = [
  { id: '1', name: 'Eamon', description: 'wysoki mezczyzna', guild: 'CKN' },
  { id: '2', name: 'Eamon', description: 'wysoki mezczyzna w kapturze', guild: 'CKN' },
  { id: '3', name: 'Krasn', description: 'krepy lysy krasnolud', guild: 'CKN' },
  { id: '4', name: 'Mara', description: 'niska kobieta', guild: 'NPC' },
  { id: '5', name: 'w', description: 'koscisty mezczyzna', guild: 'GP' }
];

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  addEventListener = jest.fn();
}

describe('people triggers enemy highlight', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let getDataMock: jest.MockedFunction<DataCatalogStore<PeopleCollection>['getData']>;

  beforeEach(async () => {
    appEventBus.clear();
    getDataMock = jest.fn().mockResolvedValue(MOCK_PEOPLE);
    const peopleStore: jest.Mocked<DataCatalogStore<PeopleCollection>> = {
      getData: getDataMock,
      addListener: jest.fn(),
      invalidate: jest.fn(),
      storeData: jest.fn(),
      clearData: jest.fn(),
    };
    getPeopleStoreMock.mockReset().mockReturnValue(peopleStore);
    client = new FakeClient();
    new People((client as unknown) as any);
    await getDataMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    appEventBus.emit('settings', { guilds: [], enemyGuilds: ['CKN'], guildColors: {} } as any);
    const lastCall = getDataMock.mock.results[getDataMock.mock.results.length - 1];
    await lastCall?.value;
  });

  afterEach(() => {
    appEventBus.clear();
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
  let getDataMock: jest.MockedFunction<DataCatalogStore<PeopleCollection>['getData']>;

  beforeEach(async () => {
    appEventBus.clear();
    getDataMock = jest.fn().mockResolvedValue(MOCK_PEOPLE);
    const peopleStore: jest.Mocked<DataCatalogStore<PeopleCollection>> = {
      getData: getDataMock,
      addListener: jest.fn(),
      invalidate: jest.fn(),
      storeData: jest.fn(),
      clearData: jest.fn(),
    };
    getPeopleStoreMock.mockReset().mockReturnValue(peopleStore);
    client = new FakeClient();
    new People((client as unknown) as any);
    await getDataMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  afterEach(() => {
    appEventBus.clear();
  });

  const emitSettings = async (detail: { guilds: string[]; enemyGuilds: string[]; guildColors?: Record<string, string> }) => {
    appEventBus.emit('settings', detail as any);
    const lastCall = getDataMock.mock.results[getDataMock.mock.results.length - 1];
    await lastCall?.value;
  };

  test('adds name after description without red color', async () => {
    await emitSettings({ guilds: ['CKN'], enemyGuilds: [], guildColors: { CKN: '#00ff00' } });
    const result = parse('Widzisz wysoki mezczyzna tutaj.');
    const red = findClosestColor('#ff0000');
    const green = findClosestColor('#00ff00');
    expect(result).not.toContain(color(red));
    expect(result).toContain(color(green));
    expect(stripAnsiCodes(result)).toContain('(Eamon CKN)');
  });

  test('adds names for two guild members in the same sentence', async () => {
    await emitSettings({ guilds: ['CKN'], enemyGuilds: [], guildColors: { CKN: '#00ff00' } });
    const result = parse('Widzisz wysoki mezczyzna oraz krepy lysy krasnolud.');
    const green = findClosestColor('#00ff00');
    const highlight = color(green);
    expect(result.split(highlight).length - 1).toBeGreaterThanOrEqual(2);
    const stripped = stripAnsiCodes(result);
    expect(stripped).toContain('(Eamon CKN)');
    expect(stripped).toContain('(Krasn CKN)');
  });

  test('colors enemy guild member in red', async () => {
    await emitSettings({ guilds: [], enemyGuilds: ['CKN'], guildColors: {} });
    const result = parse('Widzisz wysoki mezczyzna tutaj.');
    const red = findClosestColor('#ff0000');
    expect(result).toContain(color(red) + 'wysoki mezczyzna' + RESET);
    expect(result).toContain(color(red) + '(Eamon CKN)' + RESET);
  });

  test('colors two enemy guild members in one sentence', async () => {
    await emitSettings({ guilds: [], enemyGuilds: ['CKN', 'GP'], guildColors: {} });
    const result = parse('Widzisz wysoki mezczyzna i koscisty mezczyzna obok siebie.');
    const red = findClosestColor('#ff0000');
    const stripped = stripAnsiCodes(result);
    expect(stripped).toContain('(Eamon CKN)');
    expect(stripped).toContain('(w GP)');
    expect(result.split(color(red)).length - 1).toBeGreaterThanOrEqual(4);
  });

  test('colors ally and enemy differently when they appear together', async () => {
    await emitSettings({ guilds: ['CKN'], enemyGuilds: ['GP'], guildColors: { CKN: '#00ff00' } });
    const result = parse('Widzisz wysoki mezczyzna oraz koscisty mezczyzna.');
    const red = findClosestColor('#ff0000');
    const green = findClosestColor('#00ff00');
    expect(result).toContain(color(green) + '(Eamon CKN)' + RESET);
    expect(result).toContain(color(red) + '(w GP)' + RESET);
  });
});
