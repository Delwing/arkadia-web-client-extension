import Client from '../src/Client';
import appEventBus from '../src/events/app-event-bus';
import { getItemSync } from '../src/storage';

const parseCommand = jest.fn((cmd: string) => `parsed:${cmd}`);

jest.mock('../src/Triggers', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseLine: jest.fn((l: string) => l),
    parseMultiline: jest.fn((l: string) => l),
  })),
}));

jest.mock('../src/PackageHelper', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../src/OutputHandler', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../src/scripts/functionalBind', () => ({
  FunctionalBind: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    clear: jest.fn(),
    newMessage: jest.fn(),
  })),
}));

jest.mock('howler', () => {
  const instance = {
    state: jest.fn(() => 'loaded'),
    play: jest.fn(),
    stop: jest.fn(),
    once: jest.fn(),
    load: jest.fn(),
  };
  return { Howl: jest.fn(() => instance) };
});

jest.mock('../src/MapHelper', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseCommand,
    move: jest.fn((dir: string) => ({ direction: dir, moved: false })),
    followMove: jest.fn(),
  })),
}));

describe('object_num persistence and reset event', () => {
  let client: Client;
  const cleanups: (() => void)[] = [];

  beforeEach(() => {
    localStorage.clear();
    appEventBus.clear();
    client = new Client((global as any).clientAdapterMock as any);
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    appEventBus.clear();
  });

  test('stores object_num and emits reset when changed', () => {
    let resets = 0;
    cleanups.push(appEventBus.on('reset', () => { resets++; }));

    expect(client).toBeInstanceOf(Client);
    appEventBus.emit('gmcp.char.info', { name: 'Hero', object_num: 1 });
    expect(getItemSync('object_num')).toBe(1);
    expect(resets).toBe(0);

    appEventBus.emit('gmcp.char.info', { name: 'Hero', object_num: 1 });
    expect(resets).toBe(0);

    appEventBus.emit('gmcp.char.info', { name: 'Hero', object_num: 2 });
    expect(resets).toBe(1);
    expect(getItemSync('object_num')).toBe(2);
  });

});

