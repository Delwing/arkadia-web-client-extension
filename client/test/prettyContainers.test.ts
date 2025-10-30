jest.mock('../src/scripts/magicKeyLoader', () => jest.fn().mockResolvedValue([]));
jest.mock('../src/scripts/magicsLoader', () => jest.fn().mockResolvedValue([]));

import initContainers, {parseContainer, categorizeItems, createRegexpFilter, formatTable, __test as prettyContainersTestUtils} from '../src/scripts/prettyContainers';

describe('prettyContainers', () => {
  const input = 'Otwarty szary skorzany plecak zawiera zlocisty piryt, upiorny mglisty calun, skorzany buklak, gornicza lampe, oliwkowozielony serpentyn, zielonkawy awenturyn, zolty celestyn, bezbarwny gorski krysztal, mithrylowa monete, wiele zlotych monet, wiele srebrnych monet i wiele miedzianych monet.';
  const groups = [
    { name: 'ubrania', filter: createRegexpFilter(['calun']) },
    { name: 'kamienie', filter: createRegexpFilter(['piryt', 'serpentyn', 'awenturyn', 'celestyn', 'krysztal']) },
  ];

  test('parseContainer splits items', () => {
    const parsed = parseContainer(input)!;
    expect(parsed.container).toContain('plecak');
    expect(parsed.items.length).toBe(12);
    expect(parsed.items[0]).toEqual({count: 1, name: 'zlocisty piryt'});
    expect(parsed.items[10]).toEqual({count: 'wie', name: 'srebrnych monet'});
  });

  test('categorizeItems groups by filters', () => {
    const parsed = parseContainer(input)!;
    const cat = categorizeItems(parsed.items, groups);
    expect(cat.ubrania.map(i => i.name)).toContain('upiorny mglisty calun');
    expect(cat.kamienie.map(i => i.name)).toContain('zlocisty piryt');
    expect(cat.inne.map(i => i.name)).toContain('skorzany buklak');
    expect(Object.keys(cat).slice(-1)[0]).toBe('inne');
  });

  test('formatTable prints table', () => {
    const parsed = parseContainer(input)!;
    const cat = categorizeItems(parsed.items, groups);
    const table = formatTable('POJEMNIK', cat, { columns: 1 });
    expect(table).toMatch(/kamienie/);
    expect(table).toMatch(/upiorny mglisty calun/);
  });

  test('formatTable supports multiple columns', () => {
    const parsed = parseContainer(input)!;
    const cat = categorizeItems(parsed.items, groups);
    const table = formatTable('POJEMNIK', cat, { columns: 2 });
    const firstHeader = table.split('\n')[3];
    expect(firstHeader).toMatch(/ubrania/);
    expect(firstHeader).toMatch(/kamienie/);
  });

  test('formatTable ends with closing line', () => {
    const parsed = parseContainer(input)!;
    const cat = categorizeItems(parsed.items, groups);
    const table = formatTable('POJEMNIK', cat, { columns: 1 });
    const last = table.trim().split('\n').pop()!;
    expect(last).toMatch(/^\\-+\/$/);
  });

  test('formatTable applies transforms', () => {
    const parsed = parseContainer(input)!;
    const cat = categorizeItems(parsed.items, groups);
    const transforms = [
      {
        check: (item: string) => item.includes('piryt'),
        transform: (v: string) => v.toUpperCase(),
      },
    ];
    const table = formatTable('POJEMNIK', cat, { columns: 1, transforms });
    expect(table).toMatch(/ZLOCISTY PIRYT/);
  });

  test('parseContainer handles "W srodku dostrzegasz" format', () => {
    const newFormatInput = 'Otwierasz na chwile prosty skorzany plecak, sprawdzajac zawartosc. W srodku dostrzegasz dwie miedziane monety, zoltawobrazowy monacyt, oliwkowozielony serpentyn, delikatny kolczyk z topazem, polyskujacy sznur blekitnych perel, przezroczysta obraczke z krysztalu, kosciany dlugi sztylet i trojkatna wzmacniana tarcze.';
    const parsed = parseContainer(newFormatInput);
    expect(parsed).not.toBeNull();
    expect(parsed!.container).toContain('plecak');
    expect(parsed!.items.length).toBe(8);
    expect(parsed!.items[0]).toEqual({count: 2, name: 'miedziane monety'});
    expect(parsed!.items[1]).toEqual({count: 1, name: 'zoltawobrazowy monacyt'});
    expect(parsed!.items[7]).toEqual({count: 1, name: 'trojkatna wzmacniana tarcze'});
  });

  test('parseContainer converts Polish numbers to numeric values', () => {
    // Test basic numbers 1-10
    const basicNumbers = 'Otwarty skorzany plecak zawiera jeden miecz, dwa topory, trzy sztylety, cztery tarcze, piec monet, szesc klejnotow, siedem pierscieni, osiem amuletow, dziewiec butelek, dziesiec zwojow.';
    const parsed = parseContainer(basicNumbers);
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0]).toEqual({count: 1, name: 'miecz'});
    expect(parsed!.items[1]).toEqual({count: 2, name: 'topory'});
    expect(parsed!.items[2]).toEqual({count: 3, name: 'sztylety'});
    expect(parsed!.items[3]).toEqual({count: 4, name: 'tarcze'});
    expect(parsed!.items[4]).toEqual({count: 5, name: 'monet'});
    expect(parsed!.items[5]).toEqual({count: 6, name: 'klejnotow'});
    expect(parsed!.items[6]).toEqual({count: 7, name: 'pierscieni'});
    expect(parsed!.items[7]).toEqual({count: 8, name: 'amuletow'});
    expect(parsed!.items[8]).toEqual({count: 9, name: 'butelek'});
    expect(parsed!.items[9]).toEqual({count: 10, name: 'zwojow'});
  });

  test('parseContainer converts Polish teen numbers to numeric values', () => {
    const teenNumbers = 'Otwarty skorzany plecak zawiera jedenascie monet, dwanascie klejnotow, trzynascie zwojow, czternascie butelek, pietnascie pierscieni, szesnascie amuletow, siedemnascie tarcz, osiemnascie mieczy, dziewietnascie toporow.';
    const parsed = parseContainer(teenNumbers);
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0]).toEqual({count: 11, name: 'monet'});
    expect(parsed!.items[1]).toEqual({count: 12, name: 'klejnotow'});
    expect(parsed!.items[2]).toEqual({count: 13, name: 'zwojow'});
    expect(parsed!.items[3]).toEqual({count: 14, name: 'butelek'});
    expect(parsed!.items[4]).toEqual({count: 15, name: 'pierscieni'});
    expect(parsed!.items[5]).toEqual({count: 16, name: 'amuletow'});
    expect(parsed!.items[6]).toEqual({count: 17, name: 'tarcz'});
    expect(parsed!.items[7]).toEqual({count: 18, name: 'mieczy'});
    expect(parsed!.items[8]).toEqual({count: 19, name: 'toporow'});
  });

  test('parseContainer converts Polish compound numbers to numeric values', () => {
    const compoundNumbers = 'Otwarty skorzany plecak zawiera dwadziescia monet, dwadziescia jeden miecz, trzydziesci dwa topory, czterdziesci trzy sztylety, piecdziesiat tarcz.';
    const parsed = parseContainer(compoundNumbers);
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0]).toEqual({count: 20, name: 'monet'});
    expect(parsed!.items[1]).toEqual({count: 21, name: 'miecz'});
    expect(parsed!.items[2]).toEqual({count: 32, name: 'topory'});
    expect(parsed!.items[3]).toEqual({count: 43, name: 'sztylety'});
    expect(parsed!.items[4]).toEqual({count: 50, name: 'tarcz'});
  });

  test('parseContainer handles feminine forms of Polish numbers', () => {
    const feminineNumbers = 'Otwarty skorzany plecak zawiera jedna monete, dwie tarcze, dwadziescia jedna butelke, trzydziesci dwie bransoletki.';
    const parsed = parseContainer(feminineNumbers);
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0]).toEqual({count: 1, name: 'monete'});
    expect(parsed!.items[1]).toEqual({count: 2, name: 'tarcze'});
    expect(parsed!.items[2]).toEqual({count: 21, name: 'butelke'});
    expect(parsed!.items[3]).toEqual({count: 32, name: 'bransoletki'});
  });

  test('parseContainer preserves "wiele" as special case', () => {
    const wieleInput = 'Otwarty skorzany plecak zawiera wiele monet, piec klejnotow.';
    const parsed = parseContainer(wieleInput);
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0]).toEqual({count: 'wie', name: 'monet'});
    expect(parsed!.items[1]).toEqual({count: 5, name: 'klejnotow'});
  });

  test('parseContainer handles numeric digits', () => {
    const numericInput = 'Otwarty skorzany plecak zawiera 25 monet, 100 klejnotow.';
    const parsed = parseContainer(numericInput);
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0]).toEqual({count: 25, name: 'monet'});
    expect(parsed!.items[1]).toEqual({count: 100, name: 'klejnotow'});
  });

  test('formatTable obeys maxWidth', () => {
    const parsed = parseContainer(input)!;
    const cat = categorizeItems(parsed.items, groups);
    const table = formatTable('POJEMNIK', cat, { columns: 2, maxWidth: 40 });
    const lines = table.split('\n').map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));
    lines.forEach(l => expect(l.length).toBeLessThanOrEqual(40));
  });

  test('/przejrzyj alias sends ob command', () => {
    class FakeClient {
      aliases: { pattern: RegExp; callback: (m?: RegExpMatchArray) => void }[] = [];
      send = jest.fn();
      sendCommand = jest.fn();
      OutputHandler = { makeStringClickable: (s: string) => s };
      addEventListener = jest.fn();
      Triggers = { removeByTag: jest.fn(), registerTrigger: jest.fn() };
      print = jest.fn();
      contentWidth = 80;
    }
    const client = new FakeClient();
    initContainers((client as unknown) as any);
    const alias = client.aliases[0];
    alias.callback('/przejrzyj'.match(alias.pattern) as RegExpMatchArray);
    expect(client.send).toHaveBeenCalledWith('ob skrzynie');
  });

  test('createPatternMatcher returns matching fragment', () => {
    const matcher = prettyContainersTestUtils.createPatternMatcher(['czarne obsydianowe klucze']);
    expect(matcher('dwa czarne obsydianowe klucze')).toBe('czarne obsydianowe klucze');
    expect(matcher('brak dopasowania')).toBeNull();
  });

  test('createPatternMatcher prefers longer matches and is case insensitive', () => {
    const matcher = prettyContainersTestUtils.createPatternMatcher([
      'klucze',
      'Czarne Obsydianowe Klucze',
    ]);
    expect(matcher('dwa czarne obsydianowe klucze')).toBe('czarne obsydianowe klucze');
  });
});
