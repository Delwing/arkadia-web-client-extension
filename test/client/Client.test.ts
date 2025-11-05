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

jest.mock('@client/main', () => ({
  __esModule: true
}));

import Client from '@client/Client';
import { mudletColorLine } from '@modules/core/Colors';
import { Howl } from 'howler';

jest.mock('@client/sounds', () => ({
  __esModule: true,
  beepSound: 'mock-sound',
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

jest.mock('@client/Triggers', () => {
  const TriggerLine = require('@client/triggers/TriggerLine').default;
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      parseLine: jest.fn((l: string | typeof TriggerLine) => {
        if (typeof l === 'string') return l;
        return l instanceof TriggerLine ? l.toAnsiString() : l;
      }),
      parseMultiline: jest.fn((l: string | typeof TriggerLine) => {
        if (typeof l === 'string') return l;
        return l instanceof TriggerLine ? l.toAnsiString() : l;
      }),
    })),
  };
});
jest.mock('@client/PackageHelper', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@client/scripts/functionalBind', () => ({
  FunctionalBind: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    clear: jest.fn(),
    newMessage: jest.fn(),
  })),
}));


jest.mock('@shared/map/MapHelper', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      parseCommand,
      move: jest.fn((dir: string) => ({ direction: dir, moved: false })),
      followMove: jest.fn(),
    })),
  };
});

beforeEach(() => {
  document.body.innerHTML = '<div id="panel_buttons_bottom"></div><iframe id="cm-frame"></iframe>';
  (globalThis as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
  (globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
  (globalThis as any).dispatchEvent = jest.fn();
  (global as any).portMock = { onMessage: { addListener: jest.fn() }, postMessage: jest.fn() };
  (global as any).clientAdapterMock = { send: jest.fn(), stop: jest.fn(), connect: jest.fn(), output: jest.fn(), sendGmcp: jest.fn() };
});

test('requests notification permission on demand', () => {
  (global as any).Notification = { permission: 'default', requestPermission: jest.fn() };
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  client.enableNotifications();
  expect((global as any).Notification.requestPermission).toHaveBeenCalledTimes(1);
  delete (global as any).Notification;
});

test('does not request notification permission when already decided', () => {
  (global as any).Notification = { permission: 'granted', requestPermission: jest.fn() };
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  client.enableNotifications();
  expect((global as any).Notification.requestPermission).not.toHaveBeenCalled();
  delete (global as any).Notification;
});

test('registers service worker if available', () => {
  (global as any).Notification = { permission: 'granted', requestPermission: jest.fn() };
  const original = (navigator as any).serviceWorker;
  (navigator as any).serviceWorker = { register: jest.fn().mockResolvedValue(undefined) };
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
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
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  client.enableNotifications();
  expect((navigator as any).serviceWorker.register).toHaveBeenCalledWith('sw.js');
  const calledPath = (navigator as any).serviceWorker.register.mock.calls[0][0];
  expect(new URL(calledPath, document.baseURI).pathname).toBe('/test/sw.js');
  (navigator as any).serviceWorker = original;
  document.head.innerHTML = '';
  delete (global as any).Notification;
});

test('port messages emit client events', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const listener = (global as any).portMock.onMessage.addListener.mock.calls[0][0];
  const handler = jest.fn();
  client.on('npc', handler as any);
  const detail = [{ name: 'Foo', loc: 1 }];
  listener({ npc: detail });
  expect(handler).toHaveBeenCalledWith(detail);
  expect((globalThis as any).dispatchEvent).not.toHaveBeenCalled();
});

test('createEvent returns object with type and data', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  expect(client.createEvent('t', 123)).toEqual({ type: 't', data: 123 });
});

test('on allows removal', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const handler = jest.fn();
  const remove = client.on('command', handler as any);
  client.emit('command', 'bar');
  expect(handler).toHaveBeenCalledTimes(1);
  remove?.();
  client.emit('command', 'baz');
  expect(handler).toHaveBeenCalledTimes(1);
});

test('println uses print with newline', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const spy = jest.spyOn(client, 'print').mockImplementation();
  client.println('hi');
  expect(spy).toHaveBeenNthCalledWith(1, '\n');
  expect(spy).toHaveBeenNthCalledWith(2, 'hi');
  expect(spy).toHaveBeenNthCalledWith(3, '\n');
});

test('createButton creates button attached to panel', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const cb = jest.fn();
  const button = client.createButton('name', cb);
  expect(button.value).toBe('name');
  expect(button.type).toBe('button');
  expect(button.onclick).toBe(cb);
  const panel = document.getElementById('panel_buttons_bottom');
  expect(panel?.contains(button)).toBe(true);
});

test('sendCommand dispatches event and splits commands', async () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  await client.sendCommand('foo#bar');
  expect(parseCommand).toHaveBeenCalledTimes(1);
  expect(parseCommand).toHaveBeenCalledWith('foo#bar');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'parsed:foo', true, undefined);
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'bar', true, undefined);
});

test('sendCommand leaves casing unchanged by default', async () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  parseCommand.mockClear();
  await client.sendCommand('LOOK AROUND');
  expect(parseCommand).toHaveBeenCalledTimes(1);
  expect(parseCommand).toHaveBeenCalledWith('LOOK AROUND');
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith('parsed:LOOK AROUND', true, undefined);
});

test('sendCommand keeps casing for speech commands', async () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const speechCommands = [
    "'SHOUT",
    'powiedz HELLO',
    "j'HELLO",
    'jpowiedz HELLO',
    'krzyknij HELLO',
    'jkrzyknij HELLO',
    'szepnij HELLO',
    'jszepnij HELLO',
  ];

  for (const command of speechCommands) {
    parseCommand.mockClear();
    await client.sendCommand(command);
    expect(parseCommand).toHaveBeenCalledTimes(1);
    expect(parseCommand).toHaveBeenCalledWith(command);
  }
});

test('sendCommand preserves casing when requested', async () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  parseCommand.mockClear();
  await client.sendCommand('UPPER CASE', true, { preserveCase: true });
  expect(parseCommand).toHaveBeenCalledTimes(1);
  expect(parseCommand).toHaveBeenCalledWith('UPPER CASE');
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith(
    'parsed:UPPER CASE',
    true,
    {
      preserveCase: true,
    }
  );
});

test('sendCommand allows empty command', async () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  await client.sendCommand('');
  expect(parseCommand).toHaveBeenCalledWith('');
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith('parsed:', true, undefined);
});

test('sendCommand splits commands returned by parseCommand', async () => {
  parseCommand.mockImplementationOnce(() => 'foo;bar');
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  await client.sendCommand('e');
  expect(parseCommand).toHaveBeenCalledWith('e');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'foo', true, undefined);
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'bar', true, undefined);
});

test('sendCommand prints echo commands locally', async () => {
  parseCommand.mockImplementationOnce((cmd: string) => cmd);
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const printSpy = jest.spyOn(client, 'print').mockImplementation();
  await client.sendCommand('echo <red> text');
  expect(printSpy).toHaveBeenCalledWith(mudletColorLine('<red> text'));
  expect((global as any).clientAdapterMock.send).not.toHaveBeenCalled();
});

test('onLine replaces reset sequences with preceding ANSI code', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const line = '\x1b[22;38;5;1mRED\x1b[0m text \x1b[22;38;5;2mGREEN\x1b[0m';

  const result = client.onLine(line, '');

  const expected =
    '\x1b[22;38;5;1mRED\x1b[22;38;5;255m text \x1b[22;38;5;2mGREEN\x1b[22;38;5;255m';
  expect(result).toBe(expected);
});

test('onLine keeps trailing resets without preceding color', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const line = '\x1b[22;38;5;1mred\x1b[0m\x1b[0m';

  const result = client.onLine(line, '');

  const expected = '\x1b[22;38;5;1mred\x1b[22;38;5;255m\x1b[22;38;5;255m';
  expect(result).toBe(expected);
});

test('onLine restores color after inserting enclosed color', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
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
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const gray = '\x1b[22;38;5;8m';
  const line = gray + 'gray text' + '\x1b[0m';

  const result = client.onLine(line, '');

  expect(result).toBe(line);
});

test('sound playback restarts when triggered twice', async () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  await client.prepareSounds();
  const sound = (Howl as jest.Mock).mock.results[0].value;

  client.sendEvent('sound:play', { key: 'beep' });
  client.sendEvent('sound:play', { key: 'beep' });

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
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  client.updateContentWidth();
  expect(client.contentWidth).toBe(10);
});

test('support sends commands to support leader', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  jest.spyOn(client, 'sendCommand');
  jest.spyOn(client.TeamManager, 'getLeaderId').mockReturnValue('5');
  client.support();
  expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wesprzyj');
  expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wesprzyj ob_5');
});

test('sendCommand expands object shortcuts', async () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  jest.spyOn(client.ObjectManager, 'getObjectsOnLocation').mockReturnValue([
    { num: 5, shortcut: '1' },
    { num: 7, shortcut: 'A' },
    { num: 42, shortcut: '@' },
  ] as any);

  await client.sendCommand('zabij @1');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'parsed:zabij ob_5', true, undefined);

  await client.sendCommand('obejrzyj @A');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'parsed:obejrzyj ob_7', true, undefined);

  await client.sendCommand('help @@');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(3, 'parsed:help ob_42', true, undefined);
});
