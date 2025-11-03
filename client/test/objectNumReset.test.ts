import Client from '../src/Client';
import { getItemSync } from '../src/storage';

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

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="panel_buttons_bottom"></div><iframe id="cm-frame"></iframe>';
    (globalThis as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
    (globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
    (globalThis as any).dispatchEvent = jest.fn();
    (global as any).portMock = { onMessage: { addListener: jest.fn() }, postMessage: jest.fn() };
    (global as any).clientAdapterMock = { send: jest.fn(), stop: jest.fn(), connect: jest.fn(), output: jest.fn(), sendGmcp: jest.fn() };
    client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  });

  test('stores object_num and emits reset when changed', () => {
    let resets = 0;
    client.on('reset', () => { resets++; });

    client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 1 });
    expect(getItemSync('object_num')?.object_num).toBe('1');
    expect(resets).toBe(0);

    client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 1 });
    expect(resets).toBe(0);

    client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 2 });
    expect(resets).toBe(1);
    expect(getItemSync('object_num')?.object_num).toBe('2');
  });
});
