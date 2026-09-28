import initShortcuts, { getShortcut } from '@client/scripts/shortcuts';
import { globalStorage } from '@modules/core/storage';

describe('/dodaj_skrot', () => {
  beforeEach(() => {
    localStorage.clear();
    globalStorage.set('shortcuts', [] as any);
  });

  function setup(currentRoom: { id: number } | null = { id: 42 }) {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    const client: any = {
      Map: { currentRoom },
      println: jest.fn(),
      sendCommand: jest.fn(),
    };
    initShortcuts(client, aliases);
    const run = (command: string) => {
      const alias = aliases.find(a => a.pattern.test(command));
      expect(alias).toBeDefined();
      alias!.callback(command.match(alias!.pattern));
    };
    return { client, run };
  }

  test('saves the given id', () => {
    const { run } = setup();
    run('/dodaj_skrot 123 dom opis');
    expect(getShortcut('dom')).toBe(123);
  });

  test('uses the current location when the id is omitted', () => {
    const { run } = setup();
    run('/dodaj_skrot dom');
    run('/dodaj_skrot "moj dom" z opisem');
    expect(getShortcut('dom')).toBe(42);
    expect(getShortcut('moj dom')).toBe(42);
    expect((globalStorage.get('shortcuts') as any[]).find(s => s.key === 'moj dom').label).toBe('z opisem');
  });

  test('reports an unknown location instead of saving', () => {
    const { client, run } = setup(null);
    run('/dodaj_skrot nigdzie');
    expect(getShortcut('nigdzie')).toBeUndefined();
    expect(client.println).toHaveBeenCalled();
  });
});
