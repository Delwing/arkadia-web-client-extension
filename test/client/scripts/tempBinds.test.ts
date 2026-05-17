vi.mock('mudlet-map-renderer', () => ({ MapReader: jest.fn() }));

import Client from '@client/Client';
import initTempBinds from '@client/scripts/tempBinds';
import { globalStorage } from '@modules/core/storage';

describe('temp binds', () => {
  function createClient() {
    document.body.innerHTML = '';
    const adapter = {
      send: jest.fn(),
      output: jest.fn(),
      sendGmcp: jest.fn(),
      flushMessageBuffer: jest.fn(),
    } as any;
    const client = new Client(adapter);
    (client as any).println = jest.fn();
    return client;
  }

  test('setTempBind trims command and prints feedback', () => {
    const client = createClient();
    client.setTempBind(0, '  witaj  ');
    expect(client.tempBinds[0].command).toBe('witaj');
    expect((client.println as jest.Mock).mock.calls[0][0]).toBe(
      'Tymczasowe przypisanie 1 (F4) ustawione na: witaj',
    );
    (client.println as jest.Mock).mockClear();
    client.setTempBind(0, '   ');
    expect(client.tempBinds[0].command).toBeNull();
    expect((client.println as jest.Mock).mock.calls[0][0]).toBe(
      'Tymczasowe przypisanie 1 (F4) zostalo wyczyszczone.',
    );
  });

  test('bind settings event updates key and triggers stored command', () => {
    const client = createClient();
    (client as any).sendCommand = jest.fn();
    globalStorage.set('binds', { temp: [{ key: 'F6', ctrl: true }] } as any);
    expect(client.tempBinds[0].key).toBe('F6');
    expect(client.tempBinds[0].ctrl).toBe(true);
    (client.println as jest.Mock).mockClear();
    client.setTempBind(0, 'witaj');
    expect((client.println as jest.Mock).mock.calls[0][0]).toBe(
      'Tymczasowe przypisanie 1 (CTRL+F6) ustawione na: witaj',
    );
    const event = new KeyboardEvent('keydown', { key: 'F6', code: 'F6', ctrlKey: true, cancelable: true });
    const result = window.dispatchEvent(event);
    expect(result).toBe(false);
    expect((client.sendCommand as jest.Mock).mock.calls[0][0]).toBe('witaj');
  });

  test('temp bind aliases forward to client without typo variant', () => {
    const client = {
      setTempBind: jest.fn(),
    } as unknown as Client;
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initTempBinds(client, aliases);
    const alias = aliases.find((entry) => entry.pattern.test('/tbind1 ctrl+f7'));
    expect(alias).toBeDefined();
    const matches = '/tbind1 ctrl+f7'.match(alias!.pattern) as RegExpMatchArray;
    alias!.callback(matches);
    expect(client.setTempBind).toHaveBeenCalledWith(0, 'ctrl+f7');
    const typoAlias = aliases.find((entry) => entry.pattern.test('/tbdind1 ctrl+f7'));
    expect(typoAlias).toBeUndefined();
  });
});
