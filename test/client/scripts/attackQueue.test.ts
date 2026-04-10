import initAttackQueue from '@client/scripts/attackQueue';
import { characterStorage } from '@modules/core/storage';

vi.mock('@modules/core/storage', () => {
  const typedStorage = {
    get: jest.fn(() => undefined),
    set: jest.fn(),
    onChange: jest.fn(() => () => {}),
    fireListeners: jest.fn(),
    handleStorageEvent: jest.fn(),
    getCharacter: jest.fn(() => null),
    setCharacter: jest.fn(),
  };
  return {
    __esModule: true,
    characterStorage: typedStorage,
    globalStorage: typedStorage,
  };
});

vi.mock('@modules/data/peopleLoader', () => ({
  subscribeMerged: jest.fn(),
  refresh: jest.fn(() => Promise.resolve()),
}));

class FakeClient {
  TeamManager = {
    addEnemyToQueue: jest.fn(),
    peekEnemyFromQueue: jest.fn(),
    getEnemyQueue: jest.fn(() => []),
    isLeader: jest.fn(() => true),
  };
  ObjectManager = {
    getObjectsOnLocation: jest.fn(),
  };
  println = jest.fn();
  sendCommand = jest.fn();
  sendEvent = jest.fn();
  on = jest.fn();
}

describe('attack queue aliases', () => {
  let client: FakeClient;
  let aliases: { pattern: RegExp; callback: (matches: RegExpMatchArray) => void }[];

  beforeEach(() => {
    (characterStorage.onChange as jest.Mock).mockClear();
    client = new FakeClient();
    aliases = [];
    initAttackQueue((client as unknown) as any, aliases);
    client.TeamManager.addEnemyToQueue.mockReset();
    client.TeamManager.peekEnemyFromQueue.mockReset();
    client.TeamManager.getEnemyQueue.mockReset();
    client.TeamManager.getEnemyQueue.mockReturnValue([]);
    client.TeamManager.isLeader.mockClear();
    client.TeamManager.isLeader.mockReturnValue(true);
    client.ObjectManager.getObjectsOnLocation.mockReset();
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([]);
    client.println.mockClear();
    client.sendCommand.mockClear();
  });

  const execAlias = (
    alias: { pattern: RegExp; callback: (matches: RegExpMatchArray) => void },
    input: string,
  ) => {
    const matches = input.match(alias.pattern);
    if (!matches) {
      throw new Error('Pattern did not match input');
    }
    alias.callback(matches);
  };

  test('resolves shortcut to object id and prints confirmation', () => {
    const alias = aliases.find(a => a.pattern.test('/q 1'))!;
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { shortcut: '1', num: 123, desc: 'grozny orczy wojownik' },
    ]);
    client.TeamManager.addEnemyToQueue.mockReturnValue(true);

    execAlias(alias, '/q 1');

    expect(client.TeamManager.addEnemyToQueue).toHaveBeenCalledWith(123);
    expect(client.println).toHaveBeenCalledWith(
      'Dodano grozny orczy wojownik do kolejki ataku.',
    );
  });

  test('prints confirmation without description when not available', () => {
    const alias = aliases.find(a => a.pattern.test('/q 2'))!;
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { shortcut: '2', num: 456 },
    ]);
    client.TeamManager.addEnemyToQueue.mockReturnValue(true);

    execAlias(alias, '/q 2');

    expect(client.TeamManager.addEnemyToQueue).toHaveBeenCalledWith(456);
    expect(client.println).toHaveBeenCalledWith('Dodano 456 do kolejki ataku.');
  });

  test('uses object descriptions when adding by direct id', () => {
    const alias = aliases.find(a => a.pattern.test('/q ob_789'))!;
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { shortcut: '1', num: 789, desc: 'tajemniczy szpieg' },
    ]);
    client.TeamManager.addEnemyToQueue.mockReturnValue(true);

    execAlias(alias, '/q ob_789');

    expect(client.TeamManager.addEnemyToQueue).toHaveBeenCalledWith(789);
    expect(client.println).toHaveBeenCalledWith(
      'Dodano tajemniczy szpieg do kolejki ataku.',
    );
  });

  test('allows direct id via ob_ prefix and warns on duplicates', () => {
    const alias = aliases.find(a => a.pattern.test('/q ob_321'))!;
    client.TeamManager.addEnemyToQueue.mockReturnValue(false);

    execAlias(alias, '/q ob_321');

    expect(client.TeamManager.addEnemyToQueue).toHaveBeenCalledWith(321);
    expect(client.println).toHaveBeenCalledWith('ob_321 jest juz w kolejce ataku.');
  });

  test('prints warning when shortcut cannot be resolved', () => {
    const alias = aliases.find(a => a.pattern.test('/q 3'))!;
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { shortcut: '1', num: 111 },
      { shortcut: '2', num: 222 },
    ]);

    execAlias(alias, '/q 3');

    expect(client.TeamManager.addEnemyToQueue).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledWith('Niepoprawne id przeciwnika.');
  });

  test('kills next enemy from queue', () => {
    const alias = aliases.find(a => a.pattern.test('/nn'))!;
    client.TeamManager.peekEnemyFromQueue.mockReturnValue('77');

    execAlias(alias, '/nn');

    expect(client.TeamManager.peekEnemyFromQueue).toHaveBeenCalled();
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_77');
  });

  test('kills next enemy in AW mode marks target', () => {
    const alias = aliases.find(a => a.pattern.test('/nn'))!;
    const attackModeListenerCall = client.on.mock.calls.find(
      call => call[0] === 'attackMode',
    );
    const attackModeListener = attackModeListenerCall && attackModeListenerCall[1];
    client.TeamManager.peekEnemyFromQueue.mockReturnValue('12');

    attackModeListener?.('AW');
    execAlias(alias, '/nn');

    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'zabij ob_12');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wskaz ob_12 jako cel ataku', false);
  });

  test('kills next enemy in AWR mode orders team attack', () => {
    const alias = aliases.find(a => a.pattern.test('/nn'))!;
    const attackModeListenerCall = client.on.mock.calls.find(
      call => call[0] === 'attackMode',
    );
    const attackModeListener = attackModeListenerCall && attackModeListenerCall[1];
    client.TeamManager.peekEnemyFromQueue.mockReturnValue('34');

    attackModeListener?.('AWR');
    execAlias(alias, '/nn');

    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'zabij ob_34');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wskaz ob_34 jako cel ataku', false);
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'rozkaz druzynie zaatakowac ob_34', false);
  });

  test('kills next enemy using attack command from settings', () => {
    const alias = aliases.find(a => a.pattern.test('/nn'))!;
    const settingsListenerCall = (characterStorage.onChange as jest.Mock).mock.calls.find(
      (call: any[]) => call[0] === 'settings',
    );
    const settingsListener = settingsListenerCall && settingsListenerCall[1];
    client.TeamManager.peekEnemyFromQueue.mockReturnValue('44');

    settingsListener?.({ attackCommand: 'atak' });
    execAlias(alias, '/nn');

    expect(client.sendCommand).toHaveBeenCalledWith('atak ob_44');
  });

  test('notifies when queue is empty', () => {
    const alias = aliases.find(a => a.pattern.test('/nn'))!;
    client.TeamManager.peekEnemyFromQueue.mockReturnValue(undefined);

    execAlias(alias, '/nn');

    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledWith('Kolejka ataku jest pusta.');
  });
});
