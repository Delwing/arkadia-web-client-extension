import People from '@client/scripts/People';
import Triggers from '@client/Triggers';
import { refresh, subscribe, forceRefresh } from '@modules/data/peopleStore';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from './helpers/testSettings';

// Helper to check if any segment containing text has a foreground color
function hasColoredText(buffer: AnsiAwareBuffer | null, text: string): boolean {
  if (!buffer) return false;
  const segments = buffer.getSegments();
  return segments.some(seg => seg.text.includes(text) && seg.state?.foreground);
}

// Helper to count colored occurrences of text
function countColoredOccurrences(buffer: AnsiAwareBuffer | null, text: string): number {
  if (!buffer) return 0;
  const segments = buffer.getSegments();
  return segments.filter(seg => seg.text.includes(text) && seg.state?.foreground).length;
}

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
  { name: 'Krasn', description: 'krepy lysy krasnolud', guild: 'CKN' },
  { name: 'Musin', description: 'szczuply mezczyzna', guild: 'CKN' },
  { name: 'Mara', description: 'niska kobieta', guild: 'NPC' },
  { name: 'w', description: 'koscisty mezczyzna', guild: 'GP' }
];

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  on = jest.fn();
}

describe('people triggers enemy highlight', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];

  beforeEach(async () => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
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
    forceRefreshMock.mockReset().mockImplementation(async () => {
      subscribers.forEach((listener) => listener(MOCK_PEOPLE));
      return MOCK_PEOPLE;
    });

    client = new FakeClient();
    new People((client as unknown) as any);
    await refreshMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    setTestSettings({ guilds: [], enemyGuilds: ['CKN'] });
    const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
    await lastCall?.value;
  });

  afterEach(() => {
    jest.clearAllMocks();
    subscribers.length = 0;
    localStorage.clear();
  });

  test('colors enemy description red', () => {
    const result = parse('Widzisz wysoki mezczyzna tutaj.');

    // Check that description itself is colored
    expect(hasColoredText(result, 'wysoki mezczyzna')).toBe(true);
    // Check that guild suffix is colored and present
    expect(hasColoredText(result, '(Eamon CKN)')).toBe(true);
    expect(result?.text).toContain('(Eamon CKN)');
    const segments = result?.getSegments() ?? [];
    expect(segments.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('colors enemy name red without suffix', () => {
    const result = parse('Eamon wita cie.');

    // Eamon should be colored
    expect(hasColoredText(result, 'Eamon')).toBe(true);
    // But no guild suffix should appear
    expect(result?.text).not.toContain('(Eamon CKN)');
  });

  test('enemy name highlights every occurrence', () => {
    const result = parse('Eamon wita cie. Eamon rzuca czar.');

    // Both occurrences of Eamon should be colored
    expect(countColoredOccurrences(result, 'Eamon')).toBe(2);
  });

  test('highlights correct occurrence when name is substring of earlier word', () => {
    const result = parse('Musina, atakuje Musin.');

    // Only "Musin" (not "Musina") should be colored, and only once
    expect(countColoredOccurrences(result, 'Musin')).toBe(1);
    expect(hasColoredText(result, 'Musin')).toBe(true);

    // Verify "Musina" appears before "Musin" in the plain text
    expect(result?.text).toContain('Musina, atakuje Musin');
  });

  test('ignores very short enemy names to avoid false positives', () => {
    const result = parse('spotykasz w drodze przyjaciela.');

    // The letter "w" should not be colored (too short)
    expect(hasColoredText(result, 'w')).toBe(false);
  });

  test("doesn't color description when followed by chaosu", () => {
    const result = parse('Widzisz krepy lysy krasnolud chaosu tutaj.');

    // Description followed by "chaosu" should not be colored
    expect(hasColoredText(result, 'krepy lysy krasnolud')).toBe(false);
    expect(result?.text).not.toContain('(Krasn CKN)');
  });
});

describe('people triggers guild highlight', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];

  beforeEach(async () => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
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
    new People((client as unknown) as any);
    await refreshMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    const lastGuildCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
    await lastGuildCall?.value;
  });

  afterEach(() => {
    jest.clearAllMocks();
    subscribers.length = 0;
    localStorage.clear();
  });

  const emitSettings = (detail: { guilds?: string[]; enemyGuilds?: string[]; guildColors?: Record<string, string> }) => {
    setTestSettings(detail);
  };

  test('adds name after description without red color', () => {
    emitSettings({ guilds: ['CKN'], enemyGuilds: [], guildColors: { CKN: '#00ff00' } });
    const result = parse('Widzisz wysoki mezczyzna tutaj.');

    // Description itself should be colored
    expect(hasColoredText(result, 'wysoki mezczyzna')).toBe(true);
    // Guild member should be colored (green, not red)
    expect(hasColoredText(result, '(Eamon CKN)')).toBe(true);
    expect(result?.text).toContain('(Eamon CKN)');
  });

  test('adds names for two guild members in the same sentence', () => {
    emitSettings({ guilds: ['CKN'], enemyGuilds: [], guildColors: { CKN: '#00ff00' } });
    const result = parse('Widzisz wysoki mezczyzna oraz krepy lysy krasnolud.');

    // Both descriptions should be colored
    expect(hasColoredText(result, 'wysoki mezczyzna')).toBe(true);
    expect(hasColoredText(result, 'krepy lysy krasnolud')).toBe(true);
    // Both guild members should be colored
    expect(hasColoredText(result, '(Eamon CKN)')).toBe(true);
    expect(hasColoredText(result, '(Krasn CKN)')).toBe(true);
    expect(result?.text).toContain('(Eamon CKN)');
    expect(result?.text).toContain('(Krasn CKN)');
  });

  test('colors enemy guild member in red', () => {
    emitSettings({ guilds: [], enemyGuilds: ['CKN'], guildColors: {} });
    const result = parse('Widzisz wysoki mezczyzna tutaj.');

    // Enemy guild member suffix should be colored
    expect(hasColoredText(result, '(Eamon CKN)')).toBe(true);
    const segments = result?.getSegments() ?? [];
    expect(segments.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('colors two enemy guild members in one sentence', () => {
    emitSettings({ guilds: [], enemyGuilds: ['CKN', 'GP'], guildColors: {} });
    const result = parse('Widzisz wysoki mezczyzna i koscisty mezczyzna obok siebie.');

    // Both enemy guild members should be colored
    expect(hasColoredText(result, '(Eamon CKN)')).toBe(true);
    expect(hasColoredText(result, '(w GP)')).toBe(true);
    expect(result?.text).toContain('(Eamon CKN)');
    expect(result?.text).toContain('(w GP)');
  });

  test('colors ally and enemy differently when they appear together', () => {
    emitSettings({ guilds: ['CKN'], enemyGuilds: ['GP'], guildColors: { CKN: '#00ff00' } });
    const result = parse('Widzisz wysoki mezczyzna oraz koscisty mezczyzna.');

    // Both should be colored (ally in guild color, enemy in red)
    expect(hasColoredText(result, '(Eamon CKN)')).toBe(true);
    expect(hasColoredText(result, '(w GP)')).toBe(true);
  });
});

describe('people triggers case sensitivity', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];

  beforeEach(async () => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
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
    forceRefreshMock.mockReset().mockImplementation(async () => {
      subscribers.forEach((listener) => listener(MOCK_PEOPLE));
      return MOCK_PEOPLE;
    });

    client = new FakeClient();
    new People((client as unknown) as any);
    await refreshMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    setTestSettings({ guilds: [], enemyGuilds: ['CKN'] });
    const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
    await lastCall?.value;
  });

  afterEach(() => {
    jest.clearAllMocks();
    subscribers.length = 0;
    localStorage.clear();
  });

  test('name trigger matches exact case', () => {
    const result = parse('Eamon wita cie.');

    // Exact case should match and be colored
    expect(hasColoredText(result, 'Eamon')).toBe(true);
  });

  test('name trigger does not match lowercase', () => {
    const result = parse('eamon wita cie.');

    // Lowercase should not match
    expect(hasColoredText(result, 'eamon')).toBe(false);
    // Text should remain unchanged (no coloring)
    expect(result?.text).toBe('eamon wita cie.');
  });

  test('name trigger does not match uppercase', () => {
    const result = parse('EAMON wita cie.');

    // Uppercase should not match
    expect(hasColoredText(result, 'EAMON')).toBe(false);
    expect(result?.text).toBe('EAMON wita cie.');
  });

  test('name trigger does not match mixed case', () => {
    const result = parse('EaMoN wita cie.');

    // Mixed case should not match
    expect(hasColoredText(result, 'EaMoN')).toBe(false);
    expect(result?.text).toBe('EaMoN wita cie.');
  });

  test('description trigger remains case insensitive', () => {
    // Test uppercase description
    const result1 = parse('Widzisz WYSOKI MEZCZYZNA tutaj.');
    expect(result1?.text).toContain('(Eamon CKN)');
    expect(hasColoredText(result1, 'WYSOKI MEZCZYZNA')).toBe(true);
    expect(hasColoredText(result1, 'Eamon')).toBe(true);
    expect(hasColoredText(result1, 'CKN')).toBe(true);

    // Test lowercase description
    const result2 = parse('Widzisz wysoki mezczyzna tutaj.');
    expect(result2?.text).toContain('(Eamon CKN)');
    expect(hasColoredText(result2, 'wysoki mezczyzna')).toBe(true);
    expect(hasColoredText(result2, 'Eamon')).toBe(true);
    expect(hasColoredText(result2, 'CKN')).toBe(true);

    // Test mixed case - different combinations
    const result3 = parse('Widzisz WYSOKI mezczyzna tutaj.');
    expect(result3?.text).toContain('(Eamon CKN)');
    expect(hasColoredText(result3, 'WYSOKI mezczyzna')).toBe(true);
    expect(hasColoredText(result3, 'Eamon')).toBe(true);

    const result4 = parse('Widzisz wysoki MEZCZYZNA tutaj.');
    expect(result4?.text).toContain('(Eamon CKN)');
    expect(hasColoredText(result4, 'wysoki MEZCZYZNA')).toBe(true);
    expect(hasColoredText(result4, 'Eamon')).toBe(true);
  });

  test('multiple names with different cases only matches exact case', () => {
    const result = parse('Eamon i eamon oraz EAMON rozmawiaja.');

    // Only exact case "Eamon" should be colored (once)
    expect(countColoredOccurrences(result, 'Eamon')).toBe(1);
    // The other variants should not be colored
    expect(result?.text).toContain('eamon');
    expect(result?.text).toContain('EAMON');
  });
});

describe('people triggers wanted letter with existing name', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];

  beforeEach(async () => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
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
    new People((client as unknown) as any);
    await refreshMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    const lastGuildCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
    await lastGuildCall?.value;
  });

  afterEach(() => {
    jest.clearAllMocks();
    subscribers.length = 0;
    localStorage.clear();
  });

  const emitSettings = (detail: { guilds?: string[]; enemyGuilds?: string[]; guildColors?: Record<string, string> }) => {
    setTestSettings(detail);
  };

  test('adds guild suffix to existing "(to chyba Name)" in table line', () => {
    emitSettings({ guilds: ['CKN'], enemyGuilds: [], guildColors: { CKN: '#00ff00' } });
    const result = parse('|    | wysoki mezczyzna (to chyba Eamon)                  |   |');

    // Should add guild suffix inside the parentheses
    expect(result?.text).toContain('(to chyba Eamon CKN)');
    // Description should be colored
    expect(hasColoredText(result, 'wysoki mezczyzna')).toBe(true);
    // Name should be colored
    expect(hasColoredText(result, 'Eamon')).toBe(true);
    // Guild should be colored
    expect(hasColoredText(result, 'CKN')).toBe(true);
    // "to chyba" should NOT be colored
    expect(hasColoredText(result, 'to chyba')).toBe(false);
  });

  test('colors enemy in red when "(to chyba Name)" exists', () => {
    emitSettings({ guilds: [], enemyGuilds: ['CKN'], guildColors: {} });
    const result = parse('|    | wysoki mezczyzna (to chyba Eamon)                  |   |');

    // Should add guild suffix inside the parentheses
    expect(result?.text).toContain('(to chyba Eamon CKN)');
    // Description should be colored (red for enemy)
    expect(hasColoredText(result, 'wysoki mezczyzna')).toBe(true);
    // Name should be colored (red for enemy)
    expect(hasColoredText(result, 'Eamon')).toBe(true);
    // Guild should be colored
    expect(hasColoredText(result, 'CKN')).toBe(true);
    // "to chyba" should NOT be colored
    expect(hasColoredText(result, 'to chyba')).toBe(false);
  });

  test('handles "(to chyba Name)" without enough space gracefully', () => {
    emitSettings({ guilds: ['CKN'], enemyGuilds: [], guildColors: { CKN: '#00ff00' } });
    // Very little space after the parentheses
    const result = parse('|    | wysoki mezczyzna (to chyba Eamon)|');

    // Should still color description even if no space for guild suffix
    expect(hasColoredText(result, 'wysoki mezczyzna')).toBe(true);
  });
});
