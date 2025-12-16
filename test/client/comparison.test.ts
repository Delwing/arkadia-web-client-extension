import initCompareAll, { formatComparisonTable } from '@client/scripts/compareAll';
import Client from '@client/Client';
import type { ClientAdapter } from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

describe('compare all alias', () => {
  let client: Client;
  let mockAdapter: jest.Mocked<ClientAdapter>;
  let mockPort: any;
  let sendCommandSpy: jest.SpyInstance;
  let printlnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock only the external boundary
    mockAdapter = {
      send: jest.fn(),
      output: jest.fn(),
      sendGmcp: jest.fn(),
      flushMessageBuffer: jest.fn(),
      emit: jest.fn(),
    };

    // Mock port (minimal)
    mockPort = {
      postMessage: jest.fn(),
      onMessage: {
        addListener: jest.fn(),
      },
    };

    // Create REAL Client instance
    client = new Client(mockAdapter, mockPort);

    // Spy on methods we need to verify
    sendCommandSpy = jest.spyOn(client, 'sendCommand');
    printlnSpy = jest.spyOn(client, 'println').mockImplementation(() => {});

    // Mock ObjectManager
    jest.spyOn(client.ObjectManager, 'getObjectsOnLocation').mockReturnValue([]);

    // Initialize the script with aliases
    initCompareAll(client, client.aliases);

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('sends ocen commands for each target', () => {
    jest.spyOn(client.ObjectManager, 'getObjectsOnLocation').mockReturnValue([
      { num: 1, shortcut: '1' } as any,
      { num: 2, shortcut: '2' } as any,
    ]);

    // User types /por command
    client.sendCommand('/por');

    expect(sendCommandSpy).toHaveBeenCalledWith('ocen ob_1', false);
    expect(sendCommandSpy).toHaveBeenCalledWith('ocen ob_2', false);
    jest.runAllTimers();
  });

  test('prints formatted table with results', () => {
    jest.spyOn(client.ObjectManager, 'getObjectsOnLocation').mockReturnValue([
      { num: 3, shortcut: '1' } as any
    ]);

    // User types /por command
    client.sendCommand('/por');

    // MUD sends comparison result
    client.onLine('Wydaje ci sie, ze jestes silniejszy, zreczniejszy i lepiej zbudowany niz Goblin.', '');

    // Wait for timeout to display results
    jest.runAllTimers();

    expect(printlnSpy).toHaveBeenCalled();
    const printed = typeof printlnSpy.mock.calls[0][0] === 'string'
      ? printlnSpy.mock.calls[0][0]
      : printlnSpy.mock.calls[0][0]?.text;
    expect(printed).toMatch(/Goblin/);
    expect(printed).toMatch(/-3/);
  });

  test('sends ocen command for shortcut', () => {
    jest.spyOn(client.ObjectManager, 'getObjectsOnLocation').mockReturnValue([
      { num: 5, shortcut: '1' } as any,
      { num: 6, shortcut: '2' } as any,
    ]);

    // User types /por 2 command (targeting shortcut '2')
    client.sendCommand('/por 2');

    expect(sendCommandSpy).toHaveBeenCalledWith('ocen ob_6', false);
  });

  test('formats header wide enough for long descriptions', () => {
    const longName = 'przygarbiony wyszczerzony ork';
    const results = new Map();
    results.set(longName, {
      stats: { sil: -1, zre: -1, wyt: -2 },
      buffer: new AnsiAwareBuffer(longName)
    });
    const targets = new Map();
    targets.set('1', { id: '1', desc: longName });
    const table = formatComparisonTable(results, targets);
    const [header, underline, row] = table.text.split('\n');
    expect(row).toContain(longName);
    expect(underline.length).toBe(header.length);
    expect(row.length).toBe(header.length);
  });

  test('handles new single-line format with all stats', () => {
    jest.spyOn(client.ObjectManager, 'getObjectsOnLocation').mockReturnValue([
      { num: 1, shortcut: '1' } as any
    ]);

    // User types /por command
    client.sendCommand('/por');

    // MUD sends comparison result with all stats
    client.onLine('Wydaje ci sie, ze jestes duzo silniejszy, duzo lepiej zbudowany i zreczniejszy niz korpulentny rumiany halfling.', '');

    // Wait for timeout to display results
    jest.runAllTimers();

    expect(printlnSpy).toHaveBeenCalled();
    const printed = typeof printlnSpy.mock.calls[0][0] === 'string'
      ? printlnSpy.mock.calls[0][0]
      : printlnSpy.mock.calls[0][0]?.text;
    expect(printed).toContain('korpulentny rumiany halfling');
    // Note: -5 for "duzo silniejszy", "duzo lepiej zbudowany", "zreczniejszy" (without modifier is -3)
    // So total should be -5 + -5 + -3 = -13
  });

  test('handles new single-line format with mixed levels', () => {
    jest.spyOn(client.ObjectManager, 'getObjectsOnLocation').mockReturnValue([
      { num: 2, shortcut: '1' } as any
    ]);

    // User types /por command
    client.sendCommand('/por');

    // MUD sends comparison result with mixed levels
    client.onLine('Wydaje ci sie, ze jestes znacznie silniejszy, troche lepiej zbudowany i zreczniejszy niz wysoki elf.', '');

    // Wait for timeout to display results
    jest.runAllTimers();

    const printed = typeof printlnSpy.mock.calls[0][0] === 'string'
      ? printlnSpy.mock.calls[0][0]
      : printlnSpy.mock.calls[0][0]?.text;
    expect(printed).toMatch(/wysoki elf/);
    expect(printed).toMatch(/-4/); // znacznie silniejszy = -4
    expect(printed).toMatch(/-2/); // troche lepiej zbudowany = -2
    expect(printed).toMatch(/-3/); // zreczniejszy = -3
  });
});
