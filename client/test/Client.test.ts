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

jest.mock('../src/main', () => ({
  __esModule: true,
  rawInputSend: jest.fn((cmd: string) => (window as any).Input.send(cmd)),
  rawOutputSend: jest.fn(),
}));

import Client from '../src/Client';
import { mudletColorLine } from '../src/Colors';
import appEventBus from '../src/events/app-event-bus';
import { Howl } from 'howler';

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

jest.mock('../src/Triggers', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseLine: jest.fn((l: string) => l),
    parseMultiline: jest.fn((l: string) => l),
  })),
}));
jest.mock('../src/PackageHelper', () => ({ __esModule: true, default: jest.fn() }));
const outputHandlerMock = {
  processOutput: jest.fn(),
  applyClickListeners: jest.fn(),
  getCallbacksForIndices: jest.fn(() => ({})),
};

jest.mock('../src/OutputHandler', () => ({
  __esModule: true,
  default: jest.fn(() => outputHandlerMock),
}));
jest.mock('../src/scripts/functionalBind', () => ({
  FunctionalBind: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    clear: jest.fn(),
    newMessage: jest.fn(),
  })),
}));

jest.mock('../src/MapHelper', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseCommand,
    move: jest.fn((dir: string) => ({ direction: dir, moved: false })),
    followMove: jest.fn(),
  })),
}));

beforeEach(() => {
  document.body.innerHTML = '<div id="panel_buttons_bottom"></div><iframe id="cm-frame"></iframe>';
  (window as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
  (window as any).Text = { parse_patterns: jest.fn((v: any) => v) };
  (window as any).dispatchEvent = jest.fn();
  appEventBus.clear();
  parseCommand.mockImplementation((cmd: string) => `parsed:${cmd}`);
  (global as any).clientAdapterMock = { send: jest.fn(), output: jest.fn(), sendGmcp: jest.fn() };
  outputHandlerMock.processOutput.mockReset();
  outputHandlerMock.applyClickListeners.mockReset();
  outputHandlerMock.getCallbacksForIndices.mockReset();
  outputHandlerMock.getCallbacksForIndices.mockReturnValue({});
});

afterEach(() => {
  appEventBus.clear();
  jest.restoreAllMocks();
  document.head.innerHTML = '';
});

test('requests notification permission on demand', () => {
  (global as any).Notification = { permission: 'default', requestPermission: jest.fn() };
  const client = new Client((global as any).clientAdapterMock as any);
  client.enableNotifications();
  expect((global as any).Notification.requestPermission).toHaveBeenCalledTimes(1);
  delete (global as any).Notification;
});

test('does not request notification permission when already decided', () => {
  (global as any).Notification = { permission: 'granted', requestPermission: jest.fn() };
  const client = new Client((global as any).clientAdapterMock as any);
  client.enableNotifications();
  expect((global as any).Notification.requestPermission).not.toHaveBeenCalled();
  delete (global as any).Notification;
});

test('registers service worker if available', () => {
  (global as any).Notification = { permission: 'granted', requestPermission: jest.fn() };
  const original = (navigator as any).serviceWorker;
  (navigator as any).serviceWorker = { register: jest.fn().mockResolvedValue(undefined) };
  const client = new Client((global as any).clientAdapterMock as any);
  client.enableNotifications();
  expect((navigator as any).serviceWorker.register).toHaveBeenCalledWith('sw.js');
  const calledPath = (navigator as any).serviceWorker.register.mock.calls[0][0];
  expect(new URL(calledPath, document.baseURI).pathname).toBe('/sw.js');
  (navigator as any).serviceWorker = original;
  delete (global as any).Notification;
});

test('registers service worker using base path', () => {
  (global as any).Notification = { permission: 'granted', requestPermission: jest.fn() };
  document.head.innerHTML = '<base href="/test/">';
  const original = (navigator as any).serviceWorker;
  (navigator as any).serviceWorker = { register: jest.fn().mockResolvedValue(undefined) };
  const client = new Client((global as any).clientAdapterMock as any);
  client.enableNotifications();
  expect((navigator as any).serviceWorker.register).toHaveBeenCalledWith('sw.js');
  const calledPath = (navigator as any).serviceWorker.register.mock.calls[0][0];
  expect(new URL(calledPath, document.baseURI).pathname).toBe('/test/sw.js');
  (navigator as any).serviceWorker = original;
  delete (global as any).Notification;
});

test('createEvent returns object with type and data', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  expect(client.createEvent('t', 123)).toEqual({ type: 't', data: 123 });
});

test('println uses print with newline', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const spy = jest.spyOn(client, 'print').mockImplementation();
  client.println('hi');
  expect(spy).toHaveBeenNthCalledWith(1, '\n');
  expect(spy).toHaveBeenNthCalledWith(2, 'hi');
  expect(spy).toHaveBeenNthCalledWith(3, '\n');
});

test('createButton creates button attached to panel', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const cb = jest.fn();
  const button = client.createButton('name', cb);
  expect(button.value).toBe('name');
  expect(button.type).toBe('button');
  expect(button.onclick).toBe(cb);
  const panel = document.getElementById('panel_buttons_bottom');
  expect(panel?.contains(button)).toBe(true);
});

test('sendCommand dispatches event and splits commands', () => {
  const emitSpy = jest.spyOn(appEventBus, 'emit');
  const client = new Client((global as any).clientAdapterMock as any);
  client.sendCommand('foo#bar');
  expect(parseCommand).toHaveBeenCalledWith('foo#bar');
  expect(parseCommand).toHaveBeenCalledWith('parsed:foo');
  expect(parseCommand).toHaveBeenCalledWith('bar');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'parsed:parsed:foo', true);
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'parsed:bar', true);
  expect(emitSpy).toHaveBeenCalledWith('command', 'foo#bar');
});

test('sendCommand allows empty command', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  client.sendCommand('');
  expect(parseCommand).toHaveBeenCalledWith('');
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith('parsed:', true);
});

test('sendCommand splits commands returned by parseCommand', () => {
  parseCommand.mockImplementationOnce(() => 'foo;bar');
  const client = new Client((global as any).clientAdapterMock as any);
  client.sendCommand('e');
  expect(parseCommand).toHaveBeenCalledWith('e');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'parsed:foo', true);
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'parsed:bar', true);
});

test('sendCommand prints echo commands locally', () => {
  parseCommand.mockImplementationOnce((cmd: string) => cmd);
  const client = new Client((global as any).clientAdapterMock as any);
  const printSpy = jest.spyOn(client, 'print').mockImplementation();
  client.sendCommand('echo <red> text');
  expect(printSpy).toHaveBeenCalledWith(mudletColorLine('<red> text'));
  expect((global as any).clientAdapterMock.send).not.toHaveBeenCalled();
});

test('onLine emits processed output and buffered prints', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const outputs: Array<{ message: string; type?: string; clickCallbacks?: any }> = [];
  const off = appEventBus.on('output', (payload) => {
    outputs.push(payload!);
  });

  client.Triggers.parseLine = jest.fn(() => {
    client.print('printed');
    return 'processed';
  });

  const result = client.onLine('line', '');

  const expected = '\x1b[22;38;5;255mprocessed';
  expect(result).toBe(expected);
  expect(outputs).toHaveLength(2);
  expect(outputs[0]).toEqual({ message: expected, type: '' });
  expect(outputs[1]).toEqual({ message: 'printed', type: undefined });
  off();
});

test('onLine replaces reset sequences with preceding ANSI code', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const line = '\x1b[22;38;5;1mRED\x1b[0m text \x1b[22;38;5;2mGREEN\x1b[0m';

  const result = client.onLine(line, '');

  const expected =
    '\x1b[22;38;5;1mRED\x1b[22;38;5;255m text \x1b[22;38;5;2mGREEN\x1b[22;38;5;255m';
  expect(result).toBe(expected);
});

test('onLine keeps trailing resets without preceding color', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const line = '\x1b[22;38;5;1mred\x1b[0m\x1b[0m';

  const result = client.onLine(line, '');

  const expected = '\x1b[22;38;5;1mred\x1b[22;38;5;255m\x1b[22;38;5;255m';
  expect(result).toBe(expected);
});

test('onLine restores color after inserting enclosed color', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const gray = '\x1b[22;38;5;8m';
  const yellow = '\x1b[22;38;5;11m';
  const orange = '\x1b[22;38;5;215m';

  const line =
    gray +
    'one two three four ' +
    yellow +
    'five ' +
    orange +
    'orange' +
    '\x1b[0m' +
    ' six' +
    gray +
    ' seven eight nine ten';

  const result = client.onLine(line, '');

  const expected =
    gray +
    'one two three four ' +
    yellow +
    'five ' +
    orange +
    'orange' +
    yellow +
    ' six' +
    gray +
    ' seven eight nine ten';
  expect(result).toBe(expected);
});

test('onLine preserves final reset at line end', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const gray = '\x1b[22;38;5;8m';
  const line = gray + 'gray text' + '\x1b[0m';

  const result = client.onLine(line, '');

  expect(result).toBe(line);
});

test('flushBuffer emits click callback mapping with output event', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const listener = jest.fn();
  const off = appEventBus.on('output', (payload) => listener(payload));
  const callback = jest.fn();
  outputHandlerMock.getCallbacksForIndices.mockReturnValue({ 3: callback });
  client.OutputHandler.clickerCallbacks = [() => undefined, () => undefined, () => undefined, callback];
  client.buffer.push({ out: '{clickOpen:3:Opis}Klik{clickClose}', type: 'info' });

  client.flushBuffer();

  expect(outputHandlerMock.getCallbacksForIndices).toHaveBeenCalledTimes(1);
  const [[indicesArg]] = outputHandlerMock.getCallbacksForIndices.mock.calls as any;
  expect(indicesArg).toEqual(new Set([3]));
  expect(listener).toHaveBeenCalledTimes(1);
  const { message, type, clickCallbacks } = listener.mock.calls[0][0];
  expect(message).toContain('<span data-click-index="3" data-click-title="Opis">Klik</span>');
  expect(type).toBe('info');
  expect(clickCallbacks).toEqual({ 3: callback });
  off();
});

test('playSound restarts sound when called twice', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const sound = (Howl as jest.Mock).mock.results[0].value;

  client.playSound('beep');
  client.playSound('beep');

  expect(sound.stop).toHaveBeenCalledTimes(2);
  expect(sound.play).toHaveBeenCalledTimes(2);
});

test('updateContentWidth measures characters per line', () => {
  document.body.innerHTML =
    '<div id="panel_buttons_bottom"></div>' +
    '<div id="main_text_output_msg_wrapper"></div>' +
    '<span id="content-width-measure">M</span>';
  const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
  Object.defineProperty(wrapper, 'clientWidth', { value: 100, configurable: true });
  const measure = document.getElementById('content-width-measure')!;
  (measure as any).getBoundingClientRect = jest.fn(() => ({ width: 10 }));
  const client = new Client((global as any).clientAdapterMock as any);
  client.updateContentWidth();
  expect(client.contentWidth).toBe(10);
});

test('support sends commands to support leader', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  jest.spyOn(client, 'sendCommand');
  jest.spyOn(client.TeamManager, 'getLeaderId').mockReturnValue('5');
  client.support();
  expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wesprzyj');
  expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wesprzyj ob_5');
});

test('sendCommand expands object shortcuts', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  jest.spyOn(client.ObjectManager, 'getObjectsOnLocation').mockReturnValue([
    { num: 5, shortcut: '1' },
    { num: 7, shortcut: 'A' },
    { num: 42, shortcut: '@' },
  ] as any);

  client.sendCommand('zabij @1');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'parsed:zabij ob_5', true);

  client.sendCommand('obejrzyj @A');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'parsed:obejrzyj ob_7', true);

  client.sendCommand('help @@');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(3, 'parsed:help ob_42', true);
});
