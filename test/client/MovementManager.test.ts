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
import { characterStorage } from '@modules/core/storage';

vi.mock('@client/sounds', () => ({
  __esModule: true,
  beepSound: 'mock-sound',
}));

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

import { isDirection } from '@shared/map/directions';
const moveFn = jest.fn((dir: string) => ({ direction: dir, moved: isDirection(dir), suppress: false }));
const resolveFn = jest.fn((dir: string) => dir);

vi.mock('@shared/map/MapHelper', () => {
  return {
    __esModule: true,
    default: jest.fn(function () {
      return {
        parseCommand: jest.fn((cmd: string) => cmd),
        move: moveFn,
        resolveDirection: resolveFn,
        followMove: jest.fn(),
        setBlockable: jest.fn(),
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
  moveFn.mockClear();
  resolveFn.mockClear();
  resolveFn.mockImplementation((dir: string) => dir);
});

afterEach(() => {
  localStorage.clear();
});

describe('MovementManager', () => {

  test('moveMode 0 sends plain direction command', async () => {
    const client = new Client(clientAdapterMock);
    client.moveMode = 0;
    await client.sendCommand('polnoc');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('polnoc', false, undefined);
  });

  test('moveMode 1 prefixes direction with przemknij', async () => {
    const client = new Client(clientAdapterMock);
    client.moveMode = 1;
    await client.sendCommand('polnoc');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('przemknij polnoc', false, undefined);
  });

  test('moveMode 2 prefixes direction with przemknij z druzyna', async () => {
    const client = new Client(clientAdapterMock);
    client.moveMode = 2;
    await client.sendCommand('polnoc');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('przemknij z druzyna polnoc', false, undefined);
  });

  test('carriageMode prefixes direction with jedz na', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    await client.sendCommand('polnoc');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('jedz na polnoc', false, undefined);
  });

  test('carriageMode follows the direction the map resolves', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    // Room has no literal west exit, but something west of here is reachable as "nw".
    resolveFn.mockImplementation((dir: string) => (dir === 'w' ? 'nw' : dir));
    await client.sendCommand('w');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('jedz na nw', false, undefined);
  });

  test('carriageMode prefixes a resolved special exit too', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    // Room 2222 has a "latarnia" special exit and no literal exit the pressed key maps to.
    resolveFn.mockImplementation((dir: string) => (dir === 'w' ? 'latarnia' : dir));
    await client.sendCommand('w');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('jedz na latarnia', false, undefined);
  });

  test('carriageMode leaves a resolved multi-word special exit alone', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    resolveFn.mockImplementation((dir: string) => (dir === 'u' ? 'wejdz na gore' : dir));
    await client.sendCommand('u');
    // "jedz na wejdz na gore" is not a command — the exit already is one.
    expect(clientAdapterMock.send).toHaveBeenCalledWith('wejdz na gore', false, undefined);
  });

  test('a multi-word special exit typed straight out is left alone too', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    moveFn.mockImplementationOnce(() => ({ direction: 'zejdz na dol', moved: true, suppress: false }));
    await client.sendCommand('zejdz na dol');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('zejdz na dol', false, undefined);
  });

  test('moveMode does not prefix a multi-word special exit either', async () => {
    const client = new Client(clientAdapterMock);
    client.moveMode = 1;
    moveFn.mockImplementationOnce(() => ({ direction: 'przecisnij sie przez szczeline', moved: true, suppress: false }));
    await client.sendCommand('przecisnij sie przez szczeline');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('przecisnij sie przez szczeline', false, undefined);
  });

  test('single-word verb exits are left alone', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    for (const exit of ['zanurkuj', 'wyskocz', 'wyplyn', 'zawroc']) {
      moveFn.mockImplementationOnce(() => ({ direction: exit, moved: true, suppress: false }));
      await client.sendCommand(exit);
      expect(clientAdapterMock.send).toHaveBeenLastCalledWith(exit, false, undefined);
    }
  });

  test('exits that are not plain words are left alone', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    // Two rooms record a Mudlet script body as the exit, one records a bare room number.
    for (const exit of ['script:send("s")--1522', '17482']) {
      moveFn.mockImplementationOnce(() => ({ direction: exit, moved: true, suppress: false }));
      await client.sendCommand(exit);
      expect(clientAdapterMock.send).toHaveBeenLastCalledWith(exit, false, undefined);
    }
  });

  test('hyphenated compass directions still take the prefix', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    await client.sendCommand('polnocny-wschod');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('jedz na polnocny-wschod', false, undefined);
  });

  test('a special exit typed straight out is prefixed by the normal path', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    // Not a direction, so this never reaches the carriage branch — the map confirms the move and
    // the shared prefix applies. Pinned so both routes stay in agreement.
    moveFn.mockImplementationOnce(() => ({ direction: 'latarnia', moved: true, suppress: false }));
    await client.sendCommand('latarnia');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('jedz na latarnia', false, undefined);
  });

  test('carriageMode still does not advance the mapper', async () => {
    const client = new Client(clientAdapterMock);
    client.carriageMode = true;
    await client.sendCommand('polnoc');
    expect(moveFn).not.toHaveBeenCalled();
  });

  test('carriageMode takes precedence over moveMode', async () => {
    const client = new Client(clientAdapterMock);
    client.moveMode = 1;
    client.carriageMode = true;
    await client.sendCommand('polnoc');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('jedz na polnoc', false, undefined);
  });

  test('non-direction commands are sent as-is regardless of moveMode', async () => {
    const client = new Client(clientAdapterMock);
    client.moveMode = 1;
    await client.sendCommand('obejrzyj miecz');
    expect(clientAdapterMock.send).toHaveBeenCalledWith('obejrzyj miecz', false, undefined);
  });

  test('preWalkCommands are sent before movement', async () => {
    const client = new Client(clientAdapterMock);
    client.preWalkCommands = ['schowaj wszystko'];

    const callOrder: string[] = [];
    clientAdapterMock.send.mockImplementation((cmd: string) => {
      callOrder.push(cmd);
    });

    await client.sendCommand('polnoc');
    expect(callOrder).toEqual(['schowaj wszystko', 'polnoc']);
  });

  test('postWalkCommands are sent after movement', async () => {
    const client = new Client(clientAdapterMock);
    client.postWalkCommands = ['rozejrzyj sie'];

    const callOrder: string[] = [];
    clientAdapterMock.send.mockImplementation((cmd: string) => {
      callOrder.push(cmd);
    });

    await client.sendCommand('polnoc');
    expect(callOrder).toEqual(['polnoc', 'rozejrzyj sie']);
  });

  test('pre and post walk commands are both sent in order', async () => {
    const client = new Client(clientAdapterMock);
    client.preWalkCommands = ['schowaj wszystko'];
    client.postWalkCommands = ['rozejrzyj sie'];

    const callOrder: string[] = [];
    clientAdapterMock.send.mockImplementation((cmd: string) => {
      callOrder.push(cmd);
    });

    await client.sendCommand('polnoc');
    expect(callOrder).toEqual(['schowaj wszystko', 'polnoc', 'rozejrzyj sie']);
  });

  test('suppress movement when map returns suppress:true', async () => {
    moveFn.mockImplementationOnce((dir: string) => ({ direction: dir, moved: false, suppress: true }));
    const client = new Client(clientAdapterMock);
    await client.sendCommand('polnoc');
    expect(clientAdapterMock.send).not.toHaveBeenCalled();
  });

  test('facade getters/setters delegate to movementManager', () => {
    const client = new Client(clientAdapterMock);
    client.moveMode = 2;
    expect(client.movementManager.moveMode).toBe(2);

    client.carriageMode = true;
    expect(client.movementManager.carriageMode).toBe(true);

    const pre = ['cmd1'];
    client.preWalkCommands = pre;
    expect(client.movementManager.preWalkCommands).toBe(pre);

    const post = ['cmd2'];
    client.postWalkCommands = post;
    expect(client.movementManager.postWalkCommands).toBe(post);
  });

  test('already prefixed przemknij command preserves prefix', () => {
    const client = new Client(clientAdapterMock);
    client.moveMode = 0;
    client.movementManager.sendMovement('przemknij polnoc', true);
    expect(clientAdapterMock.send).toHaveBeenCalledWith('przemknij polnoc', false, undefined);
  });

  test('already prefixed przemknij z druzyna command preserves prefix', () => {
    const client = new Client(clientAdapterMock);
    client.movementManager.sendMovement('przemknij z druzyna polnoc', true);
    expect(clientAdapterMock.send).toHaveBeenCalledWith('przemknij z druzyna polnoc', false, undefined);
  });

});
