import initAttackBeep from '@client/scripts/attackBeep';
import registerLuaGagTriggers from '@client/scripts/luaGags';
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

// The attack lines come from upstream `skrypty/events` (events_lua.json), whose
// lua raises `attacked`, so the test runs the real lua through luaGags.
class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  listeners: Record<string, ((...args: any[]) => void)[]> = {};
  on = (event: string, cb: (...args: any[]) => void) => {
    (this.listeners[event] ??= []).push(cb);
    return () => {};
  };
  sendEvent = jest.fn((event: string, ...args: any[]) => {
    (this.listeners[event] ?? []).forEach(cb => cb(...args));
  });
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
    registerLuaGagTriggers((client as unknown) as any);
    initAttackBeep((client as unknown) as any);
    await refreshMock.mock.results[0]?.value;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    // initialize with enemy guilds so beeping is enabled only for configured guilds
    setTestSettings({ enemyGuilds: ['CKN'] });
    const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
    await lastCall?.value;
    jest.clearAllMocks();
  });

  test('the attacked event carries the attacker and whether the attack is special', () => {
    parse('Intia atakuje cie!');
    parse("Przy ogluszajacym akompaniamencie okrzyku bojowego 'Za Morra!' Eamon rzuca sie na ciebie, wiazac cie walka.");
    const attacked = client.sendEvent.mock.calls.filter(call => call[0] === 'attacked');
    expect(attacked).toEqual([
      ['attacked', 'Intia', false],
      ['attacked', 'Eamon', true],
    ]);
  });

  test('colours the special attack line red', () => {
    const result = parse('Eamon z pierwotna wsciekloscia rzuca sie na ciebie, rozpoczynajac walke!');
    const segments = (result as any).getSegments();
    expect(segments.every((seg: any) => seg.state?.foreground)).toBe(true);
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

  test('beeps and uppercases on the battle cry attack line', () => {
    const line = "Przy ogluszajacym akompaniamencie okrzyku bojowego 'Za Morra!' Intia rzuca sie na ciebie, wiazac cie walka.";
    const result = parse(line);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toBe('attack');
    expect(result.text).toContain('RZUCA SIE NA CIEBIE');
  });

  test('beeps on the weapon-raising and primal-rage attack lines', () => {
    expect(parse('Intia z determinacja i pewnoscia siebie unosi swoja bron i naciera na ciebie!').text)
      .toContain('NACIERA NA CIEBIE');
    expect(parse('Eamon z pierwotna wsciekloscia rzuca sie na ciebie, rozpoczynajac walke!').text)
      .toContain('RZUCA SIE NA CIEBIE');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(2);
  });

  test('beeps and uppercases on the Tzeentch attack line', () => {
    const result = parse('Intia z pelnym przebieglosci blyskiem w oku rzuca sie na ciebie!');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toBe('attack');
    expect(client.sendEvent).toHaveBeenCalledWith('attack', { attacker: 'Intia', enemy: true });
    expect(result.text).toContain('RZUCA SIE NA CIEBIE!');
  });

  test('beeps when an enemy attacks under their description', () => {
    parse('Wysoki mezczyzna z pelnym przebieglosci blyskiem w oku rzuca sie na ciebie!');
    parse('Niski mezczyzna atakuje cie!');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(client.sendEvent).toHaveBeenCalledWith('enemy.attack', { attacker: 'Wysoki mezczyzna' });
  });

  test('special attack lines beep for anyone, even with no enemy guilds', () => {
    setTestSettings({ enemyGuilds: [] });
    parse('Nieznajomy z pelnym przebieglosci blyskiem w oku rzuca sie na ciebie!');
    parse('Nieznajomy z pierwotna wsciekloscia rzuca sie na ciebie, rozpoczynajac walke!');
    parse('Nieznajomy atakuje cie!');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(2);
    const enemyCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'enemy.attack');
    expect(enemyCalls).toEqual([
      ['enemy.attack', { attacker: 'Nieznajomy' }],
      ['enemy.attack', { attacker: 'Nieznajomy' }],
    ]);
    expect(client.sendEvent).toHaveBeenCalledWith('attack', { attacker: 'Nieznajomy', enemy: false });
  });

  test('raises attack event for every attacker, enemy.attack only for enemies', () => {
    parse('Intia atakuje cie!');
    parse('Nieznajomy atakuje cie!');
    const attackCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'attack');
    expect(attackCalls).toEqual([
      ['attack', { attacker: 'Intia', enemy: true }],
      ['attack', { attacker: 'Nieznajomy', enemy: false }],
    ]);
    const enemyCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'enemy.attack');
    expect(enemyCalls).toEqual([['enemy.attack', { attacker: 'Intia' }]]);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
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
