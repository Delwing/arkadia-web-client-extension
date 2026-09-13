// The mock factories are hoisted above the imports, so the fixture lives inside
// them: one magic item with the plural forms a chest listing prints.
vi.mock('@client/scripts/magicKeyLoader', () => ({ default: jest.fn().mockResolvedValue([]) }));
vi.mock('@client/scripts/magicsLoader', () => ({
  default: jest.fn().mockResolvedValue([
    'lsniaca plomienista tarcza',
    'lsniaca plomienista tarcze',
    'lsniace plomieniste tarcze',
  ]),
}));
vi.mock('@modules/data/dataStores/magicsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@modules/data/dataStores/magicsStore')>()),
  getMagicsStore: jest.fn(() => ({
    getSnapshot: jest.fn().mockResolvedValue({
      data: {
        version: 3,
        magics: {
          'lsniaca plomienista tarcza': {
            type: ['tarcza'],
            odmiana: {
              mianownik: ['lsniaca plomienista tarcza'],
              biernik: ['lsniaca plomienista tarcze'],
              mnoga_mianownik: ['lsniace plomieniste tarcze'],
              mnoga_biernik: ['lsniace plomieniste tarcze'],
            },
          },
        },
      },
    }),
    subscribe: jest.fn(() => () => {}),
  })),
}));

import initContainers from '@client/scripts/prettyContainers';
import Client from '@client/Client';
import type { ClientAdapter } from '@client/Client';
import type { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';

describe('prettyContainers magic links', () => {
  let client: Client;
  let mockAdapter: jest.Mocked<ClientAdapter>;

  beforeEach(async () => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    setTestSettings({ prettyContainers: true, containerColumns: 1 });
    mockAdapter = {
      send: jest.fn(),
      output: jest.fn(),
      sendGmcp: jest.fn(),
      flushMessageBuffer: jest.fn(),
      emit: jest.fn(),
      shouldEchoCommand: jest.fn(() => true),
    } as unknown as jest.Mocked<ClientAdapter>;
    client = new Client(mockAdapter);
    initContainers(client);
    characterStorage.set('settings', { prettyContainers: true, containerColumns: 1 } as any);
    // Let the async magic/key loaders register their transforms.
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  /** Runs `/przejrzyj`, feeds one container line and returns the link titles + clicks. */
  const browse = (line: string) => {
    const alias = client.aliases.find(a => a.pattern.test('/przejrzyj'));
    alias!.callback('/przejrzyj'.match(alias!.pattern)!);
    client.onLine(line, '');
    client.sendEvent('output-sent', 1);
    // The echoed "ob skrzynie" command is output as a plain string; the table is
    // the buffer that follows it.
    const buffers = mockAdapter.output.mock.calls
      .map(call => call[0])
      .filter((out): out is AnsiAwareBuffer => typeof out !== 'string' && !!out);
    return buffers.flatMap(buffer => buffer.toHyperlinkSegments()).filter(segment => segment.hyperlink);
  };

  test('clicking a stack of magic items takes a single one', () => {
    const links = browse('W skrzyniach zauwazasz miedzy innymi trzy lsniace plomieniste tarcze.');
    expect(links).toHaveLength(1);
    expect(links[0].text).toContain('lsniace plomieniste tarcze');

    const sendCommand = jest.spyOn(client, 'sendCommand').mockResolvedValue(undefined);
    links[0].hyperlink!.onClick!(new MouseEvent('click'));
    expect(sendCommand).toHaveBeenCalledWith('wybierz lsniaca plomienista tarcze');
    expect(links[0].hyperlink!.title).toBe('Kliknij aby wybrać: lsniaca plomienista tarcze');
  });

  test('clicking a single magic item uses the biernik the command needs', () => {
    const links = browse('W skrzyniach zauwazasz miedzy innymi lsniaca plomienista tarcza.');
    const sendCommand = jest.spyOn(client, 'sendCommand').mockResolvedValue(undefined);
    links[0].hyperlink!.onClick!(new MouseEvent('click'));
    expect(sendCommand).toHaveBeenCalledWith('wybierz lsniaca plomienista tarcze');
  });
});
