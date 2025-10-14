import Client from '../src/Client';
import appEventBus from '../src/events/app-event-bus';
import { getItemSync, setItemSync } from '../src/storage';

(window as any).Input = { send: jest.fn() };
(window as any).Output = { send: jest.fn(), flush_buffer: jest.fn(), buffer: [] };
(window as any).Text = { parse_patterns: jest.fn((v: any) => v) };
(window as any).Maps = {
  refresh_position: jest.fn(),
  set_position: jest.fn(),
  unset_position: jest.fn(),
  data: undefined,
};
(window as any).Gmcp = { parse_option_subnegotiation: jest.fn() };
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
    document.body.innerHTML = '<div id="panel_buttons_bottom"></div><iframe id="cm-frame"></iframe>';
    (window as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
    (window as any).Text = { parse_patterns: jest.fn((v: any) => v) };
    (window as any).dispatchEvent = jest.fn();
    (global as any).portMock = { onMessage: { addListener: jest.fn() }, postMessage: jest.fn() };
    (global as any).clientAdapterMock = { send: jest.fn(), stop: jest.fn(), connect: jest.fn(), output: jest.fn(), sendGmcp: jest.fn() };
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
    expect(getItemSync('object_num')).toBe('1');
    expect(resets).toBe(0);

    appEventBus.emit('gmcp.char.info', { name: 'Hero', object_num: 1 });
    expect(resets).toBe(0);

    appEventBus.emit('gmcp.char.info', { name: 'Hero', object_num: 2 });
    expect(resets).toBe(1);
    expect(getItemSync('object_num')).toBe('2');
  });

  test('handles legacy storage wrapper format', () => {
    setItemSync('object_num', { object_num: '5' });
    let resets = 0;
    cleanups.push(appEventBus.on('reset', () => { resets++; }));

    appEventBus.emit('gmcp.char.info', { name: 'Hero', object_num: 5 });
    expect(resets).toBe(0);

    appEventBus.emit('gmcp.char.info', { name: 'Hero', object_num: 6 });
    expect(resets).toBe(1);
    expect(getItemSync('object_num')).toBe('6');
  });
});

