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

vi.mock('@client/main', () => ({
  __esModule: true
}));

import Client from '@client/Client';

vi.mock('@client/sounds', () => ({
  __esModule: true,
  beepSound: 'mock-sound',
}));

vi.mock('@client/Triggers', () => ({
  __esModule: true,
  default: jest.fn(function () {
    return {
      parseLine: jest.fn((l: any) => l),
      parseMultiline: jest.fn((l: any) => l),
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
  LINE_START_EVENT: 'lineStart',
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

const realDispatchEvent = window.dispatchEvent.bind(window);

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<iframe id="cm-frame"></iframe>';
  (globalThis as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
  (globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
  (globalThis as any).dispatchEvent = jest.fn((...args: any[]) => realDispatchEvent(...args));
  (global as any).clientAdapterMock = {
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

describe('KeyBindingManager', () => {
  test('default bind values are set', () => {
    const client = new Client((global as any).clientAdapterMock as any);
    expect(client.lampBind).toEqual({ key: 'Digit4', ctrl: true });
    expect(client.attackBind).toEqual({ key: 'Digit1', ctrl: true });
    expect(client.supportBind).toEqual({ key: 'KeyQ', ctrl: true });
    expect(client.moveModeBind).toEqual({ key: 'Backquote' });
  });

  test('setTempBind sets command on temp bind', () => {
    const client = new Client((global as any).clientAdapterMock as any);
    const printSpy = jest.spyOn(client, 'println').mockImplementation();
    client.setTempBind(0, 'zabij wroga');
    expect(client.tempBinds[0].command).toBe('zabij wroga');
    expect(printSpy).toHaveBeenCalledWith(expect.stringContaining('ustawione na: zabij wroga'));
  });

  test('setTempBind clears when empty string', () => {
    const client = new Client((global as any).clientAdapterMock as any);
    client.tempBinds[0].command = 'existing';
    const printSpy = jest.spyOn(client, 'println').mockImplementation();
    client.setTempBind(0, '  ');
    expect(client.tempBinds[0].command).toBeNull();
    expect(printSpy).toHaveBeenCalledWith(expect.stringContaining('wyczyszczone'));
  });

  test('setTempBind ignores invalid index', () => {
    const client = new Client((global as any).clientAdapterMock as any);
    const printSpy = jest.spyOn(client, 'println').mockImplementation();
    client.setTempBind(99, 'test');
    expect(printSpy).not.toHaveBeenCalled();
  });

  test('lampBind triggers lamp refill command on keydown', () => {
    const client = new Client((global as any).clientAdapterMock as any);
    const sendSpy = jest.spyOn(client, 'sendCommand').mockImplementation(() => Promise.resolve());

    const event = new KeyboardEvent('keydown', {
      code: 'Digit4',
      ctrlKey: true,
    });
    window.dispatchEvent(event);

    expect(sendSpy).toHaveBeenCalledWith('napelnij lampe olejem');
  });

  test('customBinds trigger commands on keydown', () => {
    const client = new Client((global as any).clientAdapterMock as any);
    const sendSpy = jest.spyOn(client, 'sendCommand').mockImplementation();

    client.customBinds = [
      { key: 'KeyZ', ctrl: true, command: 'custom command' },
    ];

    const event = new KeyboardEvent('keydown', {
      code: 'KeyZ',
      ctrlKey: true,
    });
    window.dispatchEvent(event);

    expect(sendSpy).toHaveBeenCalledWith('custom command');
  });

  test('tempBinds trigger commands on keydown when set', () => {
    const client = new Client((global as any).clientAdapterMock as any);
    const sendSpy = jest.spyOn(client, 'sendCommand').mockImplementation();

    client.tempBinds[0].command = 'temp command';

    const event = new KeyboardEvent('keydown', {
      code: 'F4',
    });
    window.dispatchEvent(event);

    expect(sendSpy).toHaveBeenCalledWith('temp command');
  });

  test('tempBinds do not trigger when command is null', () => {
    const client = new Client((global as any).clientAdapterMock as any);
    const sendSpy = jest.spyOn(client, 'sendCommand').mockImplementation();

    // tempBinds[0].command is null by default
    const event = new KeyboardEvent('keydown', {
      code: 'F4',
    });
    window.dispatchEvent(event);

    // sendCommand should not have been called for F4
    expect(sendSpy).not.toHaveBeenCalledWith(expect.stringContaining('temp'));
  });
});
