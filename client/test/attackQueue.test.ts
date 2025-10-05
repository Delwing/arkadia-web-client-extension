import initAttackQueue from '../src/scripts/attackQueue';

class FakeClient {
  TeamManager = {
    addEnemyToQueue: jest.fn(),
    shiftEnemyFromQueue: jest.fn(),
  };
  ObjectManager = {
    getObjectsOnLocation: jest.fn(),
  };
  println = jest.fn();
  sendCommand = jest.fn();
}

describe('attack queue aliases', () => {
  let client: FakeClient;
  let aliases: { pattern: RegExp; callback: (matches: RegExpMatchArray) => void }[];

  beforeEach(() => {
    client = new FakeClient();
    aliases = [];
    initAttackQueue((client as unknown) as any, aliases);
    client.TeamManager.addEnemyToQueue.mockReset();
    client.TeamManager.shiftEnemyFromQueue.mockReset();
    client.ObjectManager.getObjectsOnLocation.mockReset();
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

    expect(client.TeamManager.addEnemyToQueue).toHaveBeenCalledWith('123');
    expect(client.println).toHaveBeenCalledWith(
      'Dodano ob_123 (grozny orczy wojownik) do kolejki ataku.',
    );
  });

  test('prints confirmation without description when not available', () => {
    const alias = aliases.find(a => a.pattern.test('/q 2'))!;
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { shortcut: '2', num: 456 },
    ]);
    client.TeamManager.addEnemyToQueue.mockReturnValue(true);

    execAlias(alias, '/q 2');

    expect(client.TeamManager.addEnemyToQueue).toHaveBeenCalledWith('456');
    expect(client.println).toHaveBeenCalledWith('Dodano ob_456 do kolejki ataku.');
  });

  test('uses object descriptions when adding by direct id', () => {
    const alias = aliases.find(a => a.pattern.test('/q ob_789'))!;
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { shortcut: '1', num: 789, desc: 'tajemniczy szpieg' },
    ]);
    client.TeamManager.addEnemyToQueue.mockReturnValue(true);

    execAlias(alias, '/q ob_789');

    expect(client.TeamManager.addEnemyToQueue).toHaveBeenCalledWith('789');
    expect(client.println).toHaveBeenCalledWith(
      'Dodano ob_789 (tajemniczy szpieg) do kolejki ataku.',
    );
  });

  test('allows direct id via ob_ prefix and warns on duplicates', () => {
    const alias = aliases.find(a => a.pattern.test('/q ob_321'))!;
    client.TeamManager.addEnemyToQueue.mockReturnValue(false);

    execAlias(alias, '/q ob_321');

    expect(client.TeamManager.addEnemyToQueue).toHaveBeenCalledWith('321');
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
    client.TeamManager.shiftEnemyFromQueue.mockReturnValue('77');

    execAlias(alias, '/nn');

    expect(client.TeamManager.shiftEnemyFromQueue).toHaveBeenCalled();
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_77');
  });

  test('notifies when queue is empty', () => {
    const alias = aliases.find(a => a.pattern.test('/nn'))!;
    client.TeamManager.shiftEnemyFromQueue.mockReturnValue(undefined);

    execAlias(alias, '/nn');

    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledWith('Kolejka ataku jest pusta.');
  });
});
