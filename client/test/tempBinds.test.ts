jest.mock('mudlet-map-renderer', () => ({ MapReader: jest.fn() }));
jest.mock('howler', () => ({
  Howl: jest.fn().mockImplementation(() => ({
    load: jest.fn(),
    once: jest.fn(),
    play: jest.fn(),
    stop: jest.fn(),
    state: jest.fn(() => 'loaded'),
  })),
}));

import Client from '../src/Client';
import initTempBinds from '../src/scripts/tempBinds';

describe('temp binds', () => {
  function createClient() {
    document.body.innerHTML = '<div id="panel_buttons_bottom"></div>';
    const adapter = {
      send: jest.fn(),
      output: jest.fn(),
      sendGmcp: jest.fn(),
      parseAnsiPatterns: jest.fn((text: string) => text),
      flushMessageBuffer: jest.fn(),
    } as any;
    const port = {
      postMessage: jest.fn(),
      onMessage: { addListener: jest.fn() },
    } as any;
    const client = new Client(adapter, port);
    (client as any).println = jest.fn();
    return client;
  }

  test('setTempBindKey updates key and modifiers', () => {
    const client = createClient();
    client.setTempBindKey(0, 'ctrl+shift+f6');
    expect(client.tempBinds[0].key).toBe('F6');
    expect(client.tempBinds[0].ctrl).toBe(true);
    expect(client.tempBinds[0].shift).toBe(true);
    expect(client.tempBinds[0].alt).toBeUndefined();
    expect((client.println as jest.Mock).mock.calls[0][0]).toBe(
      'Tymczasowe przypisanie 1 ustawione na klawisz: CTRL+SHIFT+F6',
    );
  });

  test('setTempBindKey reports invalid key', () => {
    const client = createClient();
    client.setTempBindKey(0, 'ctrl+foo');
    expect(client.tempBinds[0].key).toBe('F4');
    expect((client.println as jest.Mock).mock.calls[0][0]).toBe('Nieznany klawisz: ctrl+foo');
  });

  test('rebound key triggers stored command', () => {
    const client = createClient();
    (client as any).sendCommand = jest.fn();
    client.setTempBindKey(0, 'f6');
    (client.println as jest.Mock).mockClear();
    client.setTempBind(0, 'witaj');
    expect((client.println as jest.Mock).mock.calls[0][0]).toBe(
      'Tymczasowe przypisanie 1 (F6) ustawione na: witaj',
    );
    const event = new KeyboardEvent('keydown', { key: 'F6', code: 'F6', cancelable: true });
    const result = window.dispatchEvent(event);
    expect(result).toBe(false);
    expect((client.sendCommand as jest.Mock).mock.calls[0][0]).toBe('witaj');
  });

  test('temp bind key alias forwards to client', () => {
    const client = {
      setTempBind: jest.fn(),
      setTempBindKey: jest.fn(),
    } as unknown as Client;
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initTempBinds(client, aliases);
    const alias = aliases.find((entry) => entry.pattern.test('/tbindkey1 ctrl+f7'));
    expect(alias).toBeDefined();
    const matches = '/tbindkey1 ctrl+f7'.match(alias!.pattern) as RegExpMatchArray;
    alias!.callback(matches);
    expect(client.setTempBindKey).toHaveBeenCalledWith(0, 'ctrl+f7');
  });
});
