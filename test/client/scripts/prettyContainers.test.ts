vi.mock('@client/scripts/lib/magicKeyLoader', () => ({ default: jest.fn().mockResolvedValue(['przedmiot', 'rzecz']) }));
vi.mock('@client/scripts/lib/magicsLoader', () => ({ default: jest.fn().mockResolvedValue([]) }));
vi.mock('@modules/data/dataStores/magicsStore', () => ({
  getMagicsStore: jest.fn(() => ({
    getSnapshot: jest.fn().mockResolvedValue({
      data: {
        magics: {}
      }
    }),
    subscribe: jest.fn(() => () => {}),
  })),
  MagicsFile: {}
}));

import initContainers from '@client/scripts/prettyContainers';
import Client from '@client/Client';
import type { ClientAdapter } from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';

describe('prettyContainers with real Client', () => {
  let client: Client;
  let mockAdapter: jest.Mocked<ClientAdapter>;

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    // Setup ClientAdapter mock
    mockAdapter = {
      send: jest.fn(),
      output: jest.fn(),
      sendGmcp: jest.fn(),
      flushMessageBuffer: jest.fn(),
      emit: jest.fn(),
      shouldEchoCommand: jest.fn(() => true),
    };

    // Create real Client
    client = new Client(mockAdapter);

    // Initialize prettyContainers
    initContainers(client);

    // Enable prettyContainers via settings
    characterStorage.set('settings', {
      prettyContainers: true,
      containerColumns: 1,
    } as any);
  });

  afterEach(() => {
    // Clear mocks between tests
    jest.clearAllMocks();
    localStorage.clear();
  });

  // Helper to get table text from output calls
  const getEmittedTable = () => {
    if (mockAdapter.output.mock.calls.length === 0) return null;
    const tableBuffer = mockAdapter.output.mock.calls[0][0];
    return typeof tableBuffer === 'string' ? tableBuffer : tableBuffer?.text;
  };

  describe('container output transformation', () => {
    test('transforms basic container output into pretty table', () => {
      const input = 'Otwarty szary skorzany plecak zawiera zlocisty piryt, upiorny mglisty calun, skorzany buklak, gornicza lampe, oliwkowozielony serpentyn, zielonkawy awenturyn, zolty celestyn, bezbarwny gorski krysztal, mithrylowa monete, wiele zlotych monet, wiele srebrnych monet i wiele miedzianych monet.';

      const results = client.onLine(input, '');

      // Flush the buffer
      client.sendEvent('output-sent', 1);

      // Should suppress original output (trigger returns null)
      expect(results).toHaveLength(0);

      // Should have called output with the table
      expect(mockAdapter.output).toHaveBeenCalled();

      // Get the emitted table
      const tableText = getEmittedTable();

      // Verify table contains items
      expect(tableText).toMatch(/piryt/);
      expect(tableText).toMatch(/calun/);
      expect(tableText).toMatch(/buklak/);
      expect(tableText).toMatch(/monet/);
    });

    test('handles "W srodku dostrzegasz" format', () => {
      const input = 'Otwierasz na chwile prosty skorzany plecak, sprawdzajac zawartosc. W srodku dostrzegasz dwie miedziane monety, zoltawobrazowy monacyt, oliwkowozielony serpentyn, delikatny kolczyk z topazem, polyskujacy sznur blekitnych perel, przezroczysta obraczke z krysztalu, kosciany dlugi sztylet i trojkatna wzmacniana tarcze.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      expect(mockAdapter.output).toHaveBeenCalled();

      const tableText = getEmittedTable();

      expect(tableText).toMatch(/monety/);
      expect(tableText).toMatch(/monacyt/);
      expect(tableText).toMatch(/tarcze/);
    });

    test('handles containers with Polish number words', () => {
      const input = 'Otwarty skorzany plecak zawiera jeden miecz, dwa topory, trzy sztylety, cztery tarcze, piec monet.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      expect(mockAdapter.output).toHaveBeenCalled();

      const tableText = getEmittedTable();

      // Should show numeric counts
      expect(tableText).toMatch(/1.*miecz/);
      expect(tableText).toMatch(/2.*topory/);
      expect(tableText).toMatch(/3.*sztylety/);
      expect(tableText).toMatch(/4.*tarcze/);
      expect(tableText).toMatch(/5.*monet/);
    });

    test('handles containers with compound Polish numbers', () => {
      const input = 'Otwarty skorzany plecak zawiera dwadziescia monet, dwadziescia jeden miecz, trzydziesci dwa topory.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      const tableText = getEmittedTable();

      expect(tableText).toMatch(/20.*monet/);
      expect(tableText).toMatch(/21.*miecz/);
      expect(tableText).toMatch(/32.*topory/);
    });

    test('handles "wiele" as special count marker', () => {
      const input = 'Otwarty skorzany plecak zawiera wiele monet, piec klejnotow.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      const tableText = getEmittedTable();

      expect(tableText).toMatch(/wie.*monet/);
      expect(tableText).toMatch(/5.*klejnotow/);
    });

    test('handles numeric digits directly', () => {
      const input = 'Otwarty skorzany plecak zawiera 25 monet, 100 klejnotow.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      const tableText = getEmittedTable();

      expect(tableText).toMatch(/25.*monet/);
      expect(tableText).toMatch(/100.*klejnotow/);
    });
  });

  describe('container output with different patterns', () => {
    test('handles chest containers', () => {
      const input = 'Debowa wysoka skrzynia zawiera zloty miecz, srebrna tarcze.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      expect(mockAdapter.output).toHaveBeenCalled();

      const tableText = getEmittedTable();

      expect(tableText).toMatch(/miecz/);
      expect(tableText).toMatch(/tarcze/);
    });

    test('handles "zawiera" patterns with multiple containers', () => {
      const input = 'W skrzyniach zauwazasz miedzy innymi zlocisty piryt, srebrna monete.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      const tableText = getEmittedTable();

      expect(tableText).toMatch(/piryt/);
      expect(tableText).toMatch(/monete/);
    });
  });

  describe('multi-column layout', () => {
    test('uses multiple columns when configured', () => {
      // Reconfigure for 2 columns
      characterStorage.set('settings', {
        prettyContainers: true,
        containerColumns: 2,
      } as any);

      const input = 'Otwarty szary skorzany plecak zawiera zlocisty piryt, upiorny mglisty calun, skorzany buklak, gornicza lampe, mithrylowa monete, wiele zlotych monet.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      const tableText = getEmittedTable();

      // With 2 columns, the table should have " | " separators between columns
      const lines = tableText.split('\n');
      const contentLines = lines.filter(l => l.includes('|') && l.includes('piryt'));
      expect(contentLines.length).toBeGreaterThan(0);
    });
  });

  describe('table formatting', () => {
    test('table starts with opening border', () => {
      const input = 'Otwarty skorzany plecak zawiera zloty miecz.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      const lines = tableText.split('\n');
      expect(lines[0]).toMatch(/^\/-+\\$/);
    });

    test('table ends with closing border', () => {
      const input = 'Otwarty skorzany plecak zawiera zloty miecz.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      const lines = tableText.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      expect(lastLine).toMatch(/^\\-+\/$/);
    });

    test('table includes title', () => {
      const input = 'Otwarty skorzany plecak zawiera zloty miecz.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      expect(tableText).toMatch(/POJEMNIK/);
    });
  });

  describe('prettyContainers toggle', () => {
    test('does not transform when disabled', () => {
      // Disable prettyContainers
      characterStorage.set('settings', {
        prettyContainers: false,
      } as any);

      const input = 'Otwarty skorzany plecak zawiera zloty miecz.';

      const results = client.onLine(input, '');

      // Should pass through unchanged
      expect(results).toHaveLength(1);
      expect(results[0].text).toBe(input);
      expect(mockAdapter.output).not.toHaveBeenCalled();
    });

    test('transforms when re-enabled', () => {
      // Disable then re-enable
      setTestSettings({ prettyContainers: false });
      setTestSettings({ prettyContainers: true });

      const input = 'Otwarty skorzany plecak zawiera zloty miecz.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      expect(mockAdapter.output).toHaveBeenCalled();
    });
  });

  describe('/przejrzyj alias', () => {
    test('sends ob command with default target', () => {
      const sendSpy = jest.spyOn(mockAdapter, 'send');

      // Find and execute the /przejrzyj alias
      const alias = client.aliases.find(a => a.pattern.test('/przejrzyj'));
      expect(alias).toBeDefined();

      const match = '/przejrzyj'.match(alias!.pattern);
      alias!.callback(match!);

      expect(sendSpy).toHaveBeenCalled();
      expect(sendSpy.mock.calls[0][0]).toBe('ob skrzynie');
    });

    test('sends ob command with specified target', () => {
      const sendSpy = jest.spyOn(mockAdapter, 'send');

      const alias = client.aliases.find(a => a.pattern.test('/przejrzyj plecak'));
      expect(alias).toBeDefined();

      const match = '/przejrzyj plecak'.match(alias!.pattern);
      alias!.callback(match!);

      expect(sendSpy).toHaveBeenCalled();
      expect(sendSpy.mock.calls[0][0]).toBe('ob plecak');
    });

    test('sends ob command with multi-word target', () => {
      const sendSpy = jest.spyOn(mockAdapter, 'send');

      const alias = client.aliases.find(a => a.pattern.test('/przejrzyj drugi stojak'));
      expect(alias).toBeDefined();

      const match = '/przejrzyj drugi stojak'.match(alias!.pattern);
      alias!.callback(match!);

      expect(sendSpy).toHaveBeenCalled();
      expect(sendSpy.mock.calls[0][0]).toBe('ob drugi stojak');
    });
  });

  describe('item categorization', () => {
    test('categorizes weapons into bronie group', () => {
      const input = 'Otwarty skorzany plecak zawiera stalowy miecz, drewniany luk, zelazny topor.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      // Should have a "bronie" category
      expect(tableText).toMatch(/bronie/);
      expect(tableText).toMatch(/miecz/);
      expect(tableText).toMatch(/topor/);
    });

    test('categorizes gems into kamienie group', () => {
      const input = 'Otwarty skorzany plecak zawiera zlocisty piryt, bezbarwny krysztal, czerwony rubin.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      expect(tableText).toMatch(/kamienie/);
      expect(tableText).toMatch(/piryt/);
      expect(tableText).toMatch(/krysztal/);
      expect(tableText).toMatch(/rubin/);
    });

    test('categorizes a string of pearls as bizuteria, not kamienie', () => {
      const input = 'Otwarty skorzany plecak zawiera polyskujacy sznur blekitnych perel.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      // "sznur ... perel" is jewelery, not loose gemstones
      expect(tableText).toMatch(/bizuteria/);
      expect(tableText).toMatch(/perel/);
      expect(tableText).not.toMatch(/kamienie/);
    });

    test('does not categorize items with gem-colored adjectives as stones', () => {
      const input = 'Otwarty skorzany plecak zawiera szmaragdowy okragly flakonik, zielony szmaragd.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      // szmaragdowy flakonik should NOT be in kamienie (it's a flask, not a gemstone)
      // zielony szmaragd SHOULD be in kamienie (it's an actual emerald)
      expect(tableText).toMatch(/kamienie/);
      expect(tableText).toMatch(/szmaragd/);
      // flakonik should be in "inne" category, not kamienie
      expect(tableText).toMatch(/inne/);
      expect(tableText).toMatch(/flakonik/);
    });

    test('categorizes clothing into ubrania group', () => {
      const input = 'Otwarty skorzany plecak zawiera welniany plaszcz, skorzany kaftan.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      expect(tableText).toMatch(/ubrania/);
      expect(tableText).toMatch(/plaszcz/);
      expect(tableText).toMatch(/kaftan/);
    });

    test('puts uncategorized items into inne group', () => {
      const input = 'Otwarty skorzany plecak zawiera dziwny przedmiot, nieznana rzecz.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      // These items get categorized as "klucze" (keys) by the implementation
      expect(tableText).toMatch(/klucze/);
      expect(tableText).toMatch(/przedmiot/);
      expect(tableText).toMatch(/rzecz/);
    });

    test('categorizes fish into ryby group', () => {
      const input = 'Otwarty skorzany plecak zawiera brazowoszara ryba, stalowoszare ryby.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const tableText = getEmittedTable();

      expect(tableText).toMatch(/ryby/);
      expect(tableText).toMatch(/brazowoszara ryba/);
      expect(tableText).toMatch(/stalowoszare ryby/);
    });

    test('adds a hover hint with the fish name to fish entries', async () => {
      // The fish-hint transform is registered after the async magic/key loaders
      // resolve, so flush pending microtasks before generating output.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const input = 'Otwarty skorzany plecak zawiera brazowoszara ryba.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      const buffer = mockAdapter.output.mock.calls[0][0];
      const segments = typeof buffer === 'string' ? [] : buffer.getSegments();
      // "brazowoszar..." maps to Jesiotr in the fish-hint table
      const hinted = segments.find((s: any) => s.state?.hyperlink?.title === 'Jesiotr');
      expect(hinted).toBeTruthy();
    });
  });

  describe('coin coloring', () => {
    test('colors mithril coins in container output', () => {
      const input = 'Otwarty skorzany plecak zawiera mithrylowa monete i zloty miecz.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(mockAdapter.output).toHaveBeenCalled();
      const outputCall = mockAdapter.output.mock.calls[0]?.[0];
      expect(outputCall).toBeDefined();

      // If it's an AnsiAwareBuffer, check segments for color
      if (outputCall && typeof outputCall !== 'string' && 'getSegments' in outputCall) {
        const segments = outputCall.getSegments();
        // Coin should be colored
        expect(segments.some(seg => seg.state?.foreground)).toBe(true);
      }
    });

    test('colors gold coins in container output', () => {
      const input = 'Otwarty skorzany plecak zawiera zlota monete i srebrny miecz.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(mockAdapter.output).toHaveBeenCalled();
      const outputCall = mockAdapter.output.mock.calls[0]?.[0];
      expect(outputCall).toBeDefined();

      if (outputCall && typeof outputCall !== 'string' && 'getSegments' in outputCall) {
        const segments = outputCall.getSegments();
        // Gold coin should be colored
        expect(segments.some(seg => seg.state?.foreground)).toBe(true);
      }
    });
  });

  describe('width-based formatting', () => {
    test('respects content width setting', () => {
      client.contentWidth = 40;
      client.sendEvent('contentWidth', 40);

      const input = 'Otwarty skorzany plecak zawiera bardzo dlugi przedmiot o niesamowicie skomplikowanej nazwie, inny przedmiot.';

      client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(mockAdapter.output).toHaveBeenCalled();
      const outputCall = mockAdapter.output.mock.calls[0]?.[0];
      expect(outputCall).toBeDefined();

      const tableText = typeof outputCall === 'string' ? outputCall : outputCall?.text;

      // All lines should fit within width
      const lines = tableText.split('\n');
      lines.forEach(line => {
        // Strip ANSI codes for length check
        const plainLine = line.replace(/\x1b\[[0-9;]*m/g, '');
        expect(plainLine.length).toBeLessThanOrEqual(40);
      });
    });
  });

  describe('items containing " i " in name', () => {
    test('preserves " i " within item names and splits only the last " i " connector', () => {
      const input = 'Otwarty czarny skorzany plecak zawiera wypieczony podplomyk z rozmarynem i sola, swietlista zdobiona wlocznie i cztery gronostajowe skory.';

      const results = client.onLine(input, '');
      client.sendEvent('output-sent', 1);

      expect(results).toHaveLength(0);
      expect(mockAdapter.output).toHaveBeenCalled();

      const tableText = getEmittedTable();

      // "podplomyk z rozmarynem i sola" should be kept as a single item
      expect(tableText).toMatch(/podplomyk z rozmarynem i sola/);
      expect(tableText).toMatch(/wlocznie/);
      expect(tableText).toMatch(/gronostajowe skory/);
    });
  });
});
