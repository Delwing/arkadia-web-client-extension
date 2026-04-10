(globalThis as any).Input = { send: jest.fn() };
(globalThis as any).Output = { send: jest.fn(), flush_buffer: jest.fn(), buffer: [] };
(globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
(globalThis as any).Maps = {
  refresh_position: jest.fn(),
  set_position: jest.fn(),
  unset_position: jest.fn(),
  data: undefined,
};
(globalThis as any).Gmcp = { parse_option_subnegotiation: jest.fn() };

vi.mock('@client/main', () => ({ __esModule: true }));

import Client from '@client/Client';
import { mudletColorLine } from '@modules/core/Colors';
import { characterStorage } from '@modules/core/storage';

vi.mock('@client/sounds', () => ({
  __esModule: true,
  beepSound: 'mock-sound',
}));

vi.mock('howler', () => {
  const instance = {
    state: jest.fn(() => 'loaded'),
    play: jest.fn(),
    stop: jest.fn(),
    once: jest.fn(),
    load: jest.fn(),
  };
  return { Howl: jest.fn(function () { return instance; }) };
});

vi.mock('@client/Triggers', async () => {
  const { AnsiAwareBuffer } = await vi.importActual<typeof import('@client/ansi/FormatState')>('@client/ansi/FormatState');
  return {
    __esModule: true,
    default: jest.fn(function () {
      return {
        parseLine: jest.fn((l: any) => {
          if (typeof l === 'string') return new AnsiAwareBuffer(l);
          return l instanceof AnsiAwareBuffer ? l : new AnsiAwareBuffer(l);
        }),
        parseMultiline: jest.fn((l: any) => {
          if (typeof l === 'string') return new AnsiAwareBuffer(l);
          return l instanceof AnsiAwareBuffer ? l : new AnsiAwareBuffer(l);
        }),
      };
    }),
  };
});
vi.mock('@client/PackageHelper', () => ({ __esModule: true, default: jest.fn() }));
vi.mock('@client/scripts/functionalBind', () => ({
  FunctionalBindManager: jest.fn(function () {
    return {
      set: jest.fn(),
      setCategory: jest.fn(),
      clear: jest.fn(),
      clearCategory: jest.fn(),
      newMessage: jest.fn(),
      getLabel: jest.fn(() => ']'),
      getCategoryLabel: jest.fn(() => ']'),
      updateOptions: jest.fn(),
    };
  }),
  formatLabel: jest.fn((opts: any) => opts.key || ''),
}));

vi.mock('@shared/map/MapHelper', () => {
  return {
    __esModule: true,
    default: jest.fn(function () {
      return {
        parseCommand: jest.fn((cmd: string) => cmd),
        move: jest.fn((dir: string) => ({ direction: dir, moved: false })),
        followMove: jest.fn(),
      };
    }),
  };
});

let clientAdapterMock: any;

beforeEach(() => {
  localStorage.clear();
  characterStorage.setCharacter('TestChar');
  document.body.innerHTML = '<iframe id="cm-frame"></iframe>';
  (globalThis as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
  (globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
  (globalThis as any).dispatchEvent = jest.fn();
  clientAdapterMock = {
    send: jest.fn(),
    stop: jest.fn(),
    connect: jest.fn(),
    output: jest.fn(),
    sendGmcp: jest.fn(),
    shouldEchoCommand: jest.fn(() => false),
    flushMessageBuffer: jest.fn(),
    emit: jest.fn(),
  };
});

afterEach(() => {
  localStorage.clear();
});

describe('CommandProcessor', () => {

  test('command hook can suppress commands by returning null', async () => {
    const client = new Client(clientAdapterMock);
    client.registerCommandHook('suppress', () => null);
    await client.sendCommand('foo');
    expect(clientAdapterMock.send).not.toHaveBeenCalled();
  });

  test('command hook can modify commands', async () => {
    const client = new Client(clientAdapterMock);
    client.registerCommandHook('modify', (command) => {
      return command.replace('foo', 'bar');
    });
    await client.sendCommand('foo');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('bar', false, undefined);
  });

  test('unregisterCommandHook removes hooks', async () => {
    const client = new Client(clientAdapterMock);
    client.registerCommandHook('suppress', () => null);
    const removed = client.unregisterCommandHook('suppress');
    expect(removed).toBe(true);
    await client.sendCommand('foo');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('foo', false, undefined);
  });

  test('unregisterCommandHook returns false for unknown id', () => {
    const client = new Client(clientAdapterMock);
    expect(client.unregisterCommandHook('nonexistent')).toBe(false);
  });

  test('alias matching stops command from being sent', async () => {
    const client = new Client(clientAdapterMock);
    const aliasCallback = jest.fn();
    client.aliases.push({ pattern: /^\/test$/, callback: aliasCallback });
    await client.sendCommand('/test');
    expect(aliasCallback).toHaveBeenCalled();
    expect(clientAdapterMock.send).not.toHaveBeenCalled();
  });

  test('unknown slash command prints error', async () => {
    const client = new Client(clientAdapterMock);
    const printSpy = jest.spyOn(client, 'print').mockImplementation();
    await client.sendCommand('/unknown');
    expect(printSpy).toHaveBeenCalledWith(mudletColorLine('--- <tomato>Nieznany alias<reset>: /unknown'));
    expect(clientAdapterMock.send).not.toHaveBeenCalled();
  });

  test('command hooks run in priority order', async () => {
    const client = new Client(clientAdapterMock);
    const order: string[] = [];
    client.registerCommandHook('low', (_cmd) => {
      order.push('low');
      return undefined;
    }, 0);
    client.registerCommandHook('high', (_cmd) => {
      order.push('high');
      return undefined;
    }, 10);
    await client.sendCommand('test');
    expect(order).toEqual(['high', 'low']);
  });

  test('commandProcessor property is accessible on client', () => {
    const client = new Client(clientAdapterMock);
    expect(client.commandProcessor).toBeDefined();
    expect(client.commandProcessor.aliases).toBe(client.aliases);
  });

});
