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

vi.mock('@client/main', () => ({
  __esModule: true
}));

import Client from '@client/Client';
import { mudletColorLine } from '@modules/core/Colors';
import { characterStorage, globalStorage } from '@modules/core/storage';
import { Howl } from 'howler';

vi.mock('@client/sounds', () => ({
  __esModule: true,
  beepSound: 'mock-sound',
}));

vi.mock('@modules/core/customSounds', () => ({
  __esModule: true,
  getCustomSound: jest.fn().mockResolvedValue(undefined),
}));

vi.mock('howler', () => {
  const makeInstance = () => ({
    state: jest.fn(() => 'loaded'),
    play: jest.fn(),
    stop: jest.fn(),
    once: jest.fn(),
    load: jest.fn(),
  });
  return {
    Howl: jest.fn(function () { return makeInstance(); }),
    Howler: { volume: jest.fn(), stop: jest.fn() },
  };
});

vi.mock('@client/Triggers', async () => {
  const { AnsiAwareBuffer } = await vi.importActual<typeof import('@client/ansi/FormatState')>('@client/ansi/FormatState');
  return {
    __esModule: true,
    default: jest.fn(function () {
      return {
        parseLine: jest.fn((l: string | typeof AnsiAwareBuffer) => {
          if (typeof l === 'string') return new AnsiAwareBuffer(l);
          return l instanceof AnsiAwareBuffer ? l : new AnsiAwareBuffer(l);
        }),
        parseMultiline: jest.fn((l: string | typeof AnsiAwareBuffer) => {
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
        parseCommand,
        move: jest.fn((dir: string) => ({ direction: dir, moved: false })),
        followMove: jest.fn(),
      };
    }),
  };
});

beforeEach(() => {
  localStorage.clear();
  characterStorage.setCharacter('TestChar');
  document.body.innerHTML = '<iframe id="cm-frame"></iframe>';
  (globalThis as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
  (globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
  (globalThis as any).dispatchEvent = jest.fn();
  (global as any).clientAdapterMock = { send: jest.fn(), stop: jest.fn(), connect: jest.fn(), output: jest.fn(), sendGmcp: jest.fn(), shouldEchoCommand: jest.fn(() => false), flushMessageBuffer: jest.fn(), emit: jest.fn() };
  jest.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('Client', () => {

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
  document.head.innerHTML = '';
  delete (global as any).Notification;
});

test('createEvent returns object with type and data', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  expect(client.createEvent('t', 123)).toEqual({ type: 't', data: 123 });
});

test('on allows removal', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const handler = jest.fn();
  const remove = client.on('command', handler as any);
  client.emit('command', 'bar');
  expect(handler).toHaveBeenCalledTimes(1);
  remove?.();
  client.emit('command', 'baz');
  expect(handler).toHaveBeenCalledTimes(1);
});

test('println uses print with newline', () => {
  const client = new Client((global as any).clientAdapterMock as any);
  const spy = jest.spyOn(client, 'print').mockImplementation();
  client.println('hi');
  expect(spy).toHaveBeenNthCalledWith(1, '\n');
  expect(spy).toHaveBeenNthCalledWith(2, 'hi');
  expect(spy).toHaveBeenNthCalledWith(3, '\n');
});

test('sendCommand dispatches event and splits commands', async () => {
  const client = new Client((global as any).clientAdapterMock as any);
  await client.sendCommand('foo#bar');
  expect(parseCommand).toHaveBeenCalledTimes(1);
  expect(parseCommand).toHaveBeenCalledWith('foo#bar');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'parsed:foo', false, undefined);
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'bar', false, undefined);
});

test('sendCommand leaves casing unchanged by default', async () => {
  const client = new Client((global as any).clientAdapterMock as any);
  parseCommand.mockClear();
  await client.sendCommand('LOOK AROUND');
  expect(parseCommand).toHaveBeenCalledTimes(1);
  expect(parseCommand).toHaveBeenCalledWith('LOOK AROUND');
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith('parsed:LOOK AROUND', false, undefined);
});

test('sendCommand keeps casing for speech commands', async () => {
  const client = new Client((global as any).clientAdapterMock as any);
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
  const client = new Client((global as any).clientAdapterMock as any);
  parseCommand.mockClear();
  await client.sendCommand('UPPER CASE', true, { preserveCase: true });
  expect(parseCommand).toHaveBeenCalledTimes(1);
  expect(parseCommand).toHaveBeenCalledWith('UPPER CASE');
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith(
    'parsed:UPPER CASE',
    false,
    {
      preserveCase: true,
    }
  );
});

test('sendCommand allows empty command', async () => {
  const client = new Client((global as any).clientAdapterMock as any);
  await client.sendCommand('');
  expect(parseCommand).toHaveBeenCalledWith('');
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith('parsed:', false, undefined);
});

test('sendCommand splits commands returned by parseCommand', async () => {
  parseCommand.mockImplementationOnce(() => 'foo;bar');
  const client = new Client((global as any).clientAdapterMock as any);
  await client.sendCommand('e');
  expect(parseCommand).toHaveBeenCalledWith('e');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'foo', false, undefined);
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'bar', false, undefined);
});

test('sendCommand does not split # in direct user input', async () => {
  parseCommand.mockImplementationOnce((cmd: string) => cmd);
  const client = new Client((global as any).clientAdapterMock as any);
  await client.sendCommand('foo#bar', true, undefined, false, true);
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledTimes(1);
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith('foo#bar', false, undefined);
});

test('sendCommand splits # when user input is transformed by parseCommand', async () => {
  parseCommand.mockImplementationOnce(() => 'cmd1#cmd2');
  const client = new Client((global as any).clientAdapterMock as any);
  await client.sendCommand('s', true, undefined, false, true);
  expect(parseCommand).toHaveBeenCalledWith('s');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'cmd1', false, undefined);
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'cmd2', false, undefined);
});

test('sendCommand prints echo commands locally', async () => {
  parseCommand.mockImplementationOnce((cmd: string) => cmd);
  const client = new Client((global as any).clientAdapterMock as any);
  const printSpy = jest.spyOn(client, 'print').mockImplementation();
  await client.sendCommand('echo <red> text');
  expect(printSpy).toHaveBeenCalledWith(mudletColorLine('<red> text'));
  expect((global as any).clientAdapterMock.send).not.toHaveBeenCalled();
});

test('sound playback restarts when triggered twice', async () => {
  const client = new Client((global as any).clientAdapterMock as any);
  await client.prepareSounds();
  const sound = (Howl as jest.Mock).mock.results[0].value;

  client.sendEvent('sound:play', { key: 'beep' });
  client.sendEvent('sound:play', { key: 'beep' });

  expect(sound.stop).toHaveBeenCalledTimes(2);
  expect(sound.play).toHaveBeenCalledTimes(2);
});

test('sound:category with no config plays default beep', async () => {
  const client = new Client((global as any).clientAdapterMock as any);
  await client.prepareSounds();
  const sound = (Howl as jest.Mock).mock.results[0].value;

  client.sendEvent('sound:category', 'attack');

  expect(sound.stop).toHaveBeenCalledTimes(1);
  expect(sound.play).toHaveBeenCalledTimes(1);
});

test('sound:category with null config is silenced', async () => {
  globalStorage.set('uiSettings', {
    ...globalStorage.get('uiSettings'),
    soundCategories: { attack: null },
  } as any);
  const client = new Client((global as any).clientAdapterMock as any);
  await client.prepareSounds();
  const sound = (Howl as jest.Mock).mock.results[0].value;

  client.sendEvent('sound:category', 'attack');

  expect(sound.play).not.toHaveBeenCalled();
});

test('sound:category with custom key plays that sound', async () => {
  globalStorage.set('uiSettings', {
    ...globalStorage.get('uiSettings'),
    soundCategories: { attack: 'my-sound' },
  } as any);
  // mock getCustomSound to return data for 'my-sound'
  const { getCustomSound } = await import('@modules/core/customSounds');
  (getCustomSound as jest.Mock).mockResolvedValueOnce({ data: 'data:audio/mp3;base64,abc', key: 'my-sound', name: 'My Sound' });

  const client = new Client((global as any).clientAdapterMock as any);
  await client.prepareSounds();

  // Trigger category play
  client.sendEvent('sound:category', 'attack');
  // Wait for async sound creation
  await new Promise(resolve => setTimeout(resolve, 0));

  const calls = (Howl as jest.Mock).mock.calls;
  const customSoundCall = calls.find(c => Array.isArray(c[0]?.src)
    ? c[0].src.includes('data:audio/mp3;base64,abc')
    : c[0]?.src === 'data:audio/mp3;base64,abc');
  expect(customSoundCall).toBeDefined();
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
  jest.spyOn(client.TeamManager, 'getLeaderId').mockReturnValue(5);
  client.support();
  expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wesprzyj');
  expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wesprzyj ob_5');
});

test('sendCommand expands object shortcuts', async () => {
  const client = new Client((global as any).clientAdapterMock as any);
  jest.spyOn(client.ObjectManager, 'getObjectsOnLocation').mockReturnValue([
    { num: 5, shortcut: '1' },
    { num: 7, shortcut: 'A' },
    { num: 42, shortcut: '@' },
  ] as any);

  await client.sendCommand('zabij @1');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'parsed:zabij ob_5', false, undefined);

  await client.sendCommand('obejrzyj @A');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'parsed:obejrzyj ob_7', false, undefined);

  await client.sendCommand('help @@');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(3, 'parsed:help ob_42', false, undefined);
});

}); // describe('Client')
