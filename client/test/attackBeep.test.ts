import initAttackBeep from '../src/scripts/attackBeep';
import Triggers, {stripAnsiCodes} from '../src/Triggers';
import {findClosestColor} from '../src/Colors';
import {dataCatalog} from '../src/dataCatalog/catalogInstance';
import {DataCatalogStore} from '../src/dataCatalog/DataCatalog';
import {PeopleCollection} from '../src/dataCatalog/entities';
import appEventBus from '../src/events/app-event-bus';

jest.mock('../src/dataCatalog/catalogInstance', () => ({
  dataCatalog: {
    getPeopleStore: jest.fn(),
  },
}));

const dataCatalogMock = dataCatalog as jest.Mocked<typeof dataCatalog>;
const getPeopleStoreMock = dataCatalogMock.getPeopleStore;

const MOCK_PEOPLE: PeopleCollection = [
  { id: '1', name: 'Intia', description: 'wojowniczka', guild: 'CKN' },
  { id: '2', name: 'Eamon', description: 'wysoki mezczyzna', guild: 'CKN' },
];

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  playSound = jest.fn();
  addEventListener = jest.fn();
}

describe('attack beep triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let getDataMock: jest.Mock<Promise<PeopleCollection>, [unknown?]>;

  beforeEach(async () => {
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
    initAttackBeep((client as unknown) as any);
    await getDataMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    // initialize with enemy guilds so beeping is enabled only for configured guilds
    appEventBus.emit('settings', { enemyGuilds: ['CKN'] } as any);
    const lastCall = getDataMock.mock.results[getDataMock.mock.results.length - 1];
    await lastCall?.value;
    await Promise.resolve();
    jest.clearAllMocks();
  });

  afterEach(() => {
    appEventBus.clear();
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
