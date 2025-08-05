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
jest.mock('../src/OutputHandler', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../src/scripts/functionalBind', () => ({
  FunctionalBind: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    clear: jest.fn(),
    newMessage: jest.fn(),
  })),
}));


jest.mock('../src/MapHelper', () => {
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
  (window as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
  (window as any).Text = { parse_patterns: jest.fn((v: any) => v) };
  (window as any).dispatchEvent = jest.fn();
  (global as any).portMock = { onMessage: { addListener: jest.fn() }, postMessage: jest.fn() };
  (global as any).clientAdapterMock = { send: jest.fn(), stop: jest.fn(), connect: jest.fn(), output: jest.fn(), sendGmcp: jest.fn() };
});

test('port messages trigger window events', () => {
  new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const listener = (global as any).portMock.onMessage.addListener.mock.calls[0][0];
  const detail = [{ name: 'Foo', loc: 1 }];
  listener({ npc: detail });
  expect((window as any).dispatchEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'npc', detail })
  );
});

test('createEvent returns object with type and data', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  expect(client.createEvent('t', 123)).toEqual({ type: 't', data: 123 });
});

test('addEventListener allows removal', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const handler = jest.fn();
  const remove = client.addEventListener('foo', handler);
  client.eventTarget.dispatchEvent(new CustomEvent('foo', { detail: 'bar' }));
  expect(handler).toHaveBeenCalledTimes(1);
  remove();
  client.eventTarget.dispatchEvent(new CustomEvent('foo', { detail: 'bar' }));
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

test('sendCommand dispatches event and splits commands', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  client.sendCommand('foo#bar');
  expect(parseCommand).toHaveBeenCalledWith('foo#bar');
  expect(parseCommand).toHaveBeenCalledWith('parsed:foo');
  expect(parseCommand).toHaveBeenCalledWith('bar');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'parsed:parsed:foo', true);
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'parsed:bar', true);
});

test('sendCommand allows empty command', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  client.sendCommand('');
  expect(parseCommand).toHaveBeenCalledWith('');
  expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith('parsed:', true);
});

test('sendCommand splits commands returned by parseCommand', () => {
  parseCommand.mockImplementationOnce(() => 'foo;bar');
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  client.sendCommand('e');
  expect(parseCommand).toHaveBeenCalledWith('e');
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(1, 'parsed:foo', true);
  expect((global as any).clientAdapterMock.send).toHaveBeenNthCalledWith(2, 'parsed:bar', true);
});

test('sendCommand prints echo commands locally', () => {
  parseCommand.mockImplementationOnce((cmd: string) => cmd);
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const printSpy = jest.spyOn(client, 'print').mockImplementation();
  client.sendCommand('echo <red> text');
  expect(printSpy).toHaveBeenCalledWith(mudletColorLine('<red> text'));
  expect((global as any).clientAdapterMock.send).not.toHaveBeenCalled();
});

test('onLine sends printed messages after line and restores Output.send', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
  const originalOutputSend = (window as any).Output.send;

  client.Triggers.parseLine = jest.fn(() => {
    client.print('printed');
    return 'processed';
  });

  const result = client.onLine('line', '');

  const expected = '\x1b[22;38;5;255mprocessed';
  expect(result).toBe(expected);
  expect((window as any).Output.send).toBe(originalOutputSend);
  expect(originalOutputSend).not.toHaveBeenCalled();

  originalOutputSend(result);
  client.sendEvent('output-sent');

  expect(originalOutputSend).toHaveBeenNthCalledWith(1, expected);
  expect((global as any).clientAdapterMock.output).toHaveBeenCalledWith('printed', undefined);
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

test('playSound restarts sound when called twice', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
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

test('sendCommand expands object shortcuts', () => {
  const client = new Client((global as any).clientAdapterMock as any, (global as any).portMock);
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

