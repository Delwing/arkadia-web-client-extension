import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';

const parseCommand = jest.fn((cmd: string) => `parsed:${cmd}`);

vi.mock('@client/Triggers', () => ({
  __esModule: true,
  default: jest.fn(function () {
    return {
      parseLine: jest.fn((l: string) => l),
      parseMultiline: jest.fn((l: string) => l),
    };
  }),
}));

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

vi.mock('@shared/map/MapHelper', () => ({
  __esModule: true,
  default: jest.fn(function () {
    return {
      parseCommand,
      move: jest.fn((dir: string) => ({ direction: dir, moved: false })),
      followMove: jest.fn(),
    };
  }),
}));

describe('object_num persistence and reset event', () => {
  let client: Client;

  beforeEach(() => {
    localStorage.clear();
    // The bus is a module singleton and Clients never unsubscribe, so without this
    // the previous test's Client still answers this one's events.
    eventBus.clear();
    characterStorage.setCharacter('TestChar');
    document.body.innerHTML = '<iframe id="cm-frame"></iframe>';
    (globalThis as any).dispatchEvent = jest.fn();
    (global as any).clientAdapterMock = { send: jest.fn(), stop: jest.fn(), connect: jest.fn(), output: jest.fn(), sendGmcp: jest.fn() };
    client = new Client((global as any).clientAdapterMock as any);
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('stores object_num and emits reset when a new session brings a new one', () => {
    let resets = 0;
    client.on('reset', () => { resets++; });

    client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 1 });
    expect(characterStorage.get('object_num')).toBe('1');
    expect(resets).toBe(0);

    client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 1 });
    expect(resets).toBe(0);

    client.sendEvent('client.connect');
    client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 2 });
    expect(resets).toBe(1);
    expect(characterStorage.get('object_num')).toBe('2');
  });

  // Nothing explained the new id, so it was a death and respawn - see
  // PlayerIdentity.test.ts for the transformation that is not.
  test('an unexplained new id mid-session resets, a tick later', async () => {
    let resets = 0;
    client.on('reset', () => { resets++; });

    client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 1 });
    expect(resets).toBe(0);

    client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 2 });
    // The id itself is adopted at once; only the verdict on the session waits.
    expect(client.PlayerIdentity.num).toBe(2);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(resets).toBe(1);
    expect(client.PlayerIdentity.sessionNum).toBe(2);
    expect(characterStorage.get('object_num')).toBe('2');
  });

  test('switching character in place is a new session, not a new body', () => {
    let resets = 0;
    client.on('reset', () => { resets++; });

    // Villain has played in this browser before, so there is stored state to drop.
    characterStorage.setCharacter('Villain');
    characterStorage.set('object_num', '7');
    characterStorage.setCharacter('Hero');

    client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 1 });
    expect(resets).toBe(0);

    client.sendEvent('gmcp.char.info', { name: 'Villain', object_num: 2 });
    expect(resets).toBe(1);
    expect(client.PlayerIdentity.sessionNum).toBe(2);
    expect(characterStorage.get('object_num')).toBe('2');
  });
});
