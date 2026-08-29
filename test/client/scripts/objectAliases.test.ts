import initObjectAliases from '@client/scripts/objectAliases';
import { gmcp } from '@client/gmcp';

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
import { characterStorage } from '@modules/core/storage';

class FakeClient {
  ObjectManager = {
    getObjectsOnLocation: jest.fn(() => []),
  };
  TeamManager = {
    getAttackTargetId: jest.fn(() => undefined),
    getDefenseTargetId: jest.fn(() => undefined),
    getAccumulatedObjectsData: jest.fn(() => new Map()),
    isLeader: jest.fn(() => true),
  };
  sendCommand = jest.fn();
  registerCommandHook = jest.fn();
  releaseGuard = jest.fn(() => this.sendCommand('przestan zaslaniac'));
  goOutOfGuard = jest.fn(() => this.sendCommand('przestan kryc sie za zaslona'));
  sendGMCP = jest.fn();
  print = jest.fn();
  sendEvent = jest.fn();
  on = jest.fn();
}

describe('object aliases', () => {
  let client: FakeClient;
  let kill: (m: RegExpMatchArray) => void;
  let shield: (m: RegExpMatchArray) => void;
  let surprise: (m: RegExpMatchArray) => void;
  let killTarget: () => void;
  let surpriseTarget: () => void;
  let shieldTarget: () => void;
  let invite: (m: RegExpMatchArray) => void;
  let toggle: () => void;
  let shieldGroup: (m: RegExpMatchArray) => void;
  let withdraw: (m: RegExpMatchArray) => void;
  let passLeadership: (m: RegExpMatchArray) => void;
  let breakDefense: (m?: RegExpMatchArray) => void;
  let orderAttack: (m: RegExpMatchArray) => void;
  let orderAttackTarget: () => void;
  let orderShield: (m: RegExpMatchArray) => void;
  let orderShieldTarget: () => void;
  let markAttack: (m: RegExpMatchArray) => void;
  let markDefense: (m: RegExpMatchArray) => void;
  let setAttackMode: (mode: 'A' | 'AW' | 'AWR') => void;

  beforeEach(() => {
    (characterStorage.onChange as jest.Mock).mockClear();
    (characterStorage.get as jest.Mock).mockClear();
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
    initObjectAliases((client as unknown) as any, aliases);

    const getAlias = (pattern: RegExp) => {
      const entry = aliases.find(alias => alias.pattern.toString() === pattern.toString());
      if (!entry) {
        throw new Error(`Alias for pattern ${pattern} not found`);
      }
      return entry.callback as (m: RegExpMatchArray) => void;
    };

    kill = getAlias(/\/z ([0-9]+)$/);
    surprise = getAlias(/\/x ([0-9]+)$/);
    shield = getAlias(/\/zas ([A-Za-z0-9@]+)$/);
    killTarget = getAlias(/^\/z$/) as unknown as () => void;
    surpriseTarget = getAlias(/^\/x$/) as unknown as () => void;
    shieldTarget = getAlias(/^\/zas$/) as unknown as () => void;
    invite = getAlias(/\/zap ([0-9]+)$/);
    toggle = getAlias(/^\/puszczaj$/) as unknown as () => void;
    shieldGroup = getAlias(/^\/za([234]) ([A-Za-z0-9@]+)$/);
    withdraw = getAlias(/\/w ([A-Za-z0-9@]+)$/);
    passLeadership = getAlias(/\/pro ([A-Za-z0-9@]+)$/);
    breakDefense = getAlias(/\/prze(?: ([A-Za-z0-9@]+))?$/) as unknown as (
      m?: RegExpMatchArray,
    ) => void;
    orderAttack = getAlias(/\/ra ([0-9]+)$/);
    orderAttackTarget = getAlias(/^\/ra$/) as unknown as () => void;
    orderShield = getAlias(/\/rz ([A-Za-z0-9@]+)$/);
    orderShieldTarget = getAlias(/^\/rz$/) as unknown as () => void;
    markAttack = getAlias(/\/wa ([0-9]+)$/);
    markDefense = getAlias(/\/wz ([A-Za-z0-9@]+)$/);
    (global as any).Input = { send: jest.fn() };
    (globalThis as any).gmcp = gmcp;
    gmcp.char = { options: { group_cover: 1 } } as any;

    (characterStorage.set as jest.Mock).mockClear();

    const attackModeCall = client.on.mock.calls.find(c => c[0] === 'attackMode');
    setAttackMode = attackModeCall && attackModeCall[1];
  });

  test('kill alias sends zabij with object number', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 5, shortcut: '1' }]);
    kill(['', '1'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_5');
  });

  test('surprise alias sends zaskocz with object number', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 6, shortcut: '2' }]);
    surprise(['', '2'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('zaskocz ob_6');
  });

  test('kill alias uses attack command from settings when provided', () => {
    const settingsListenerCall = (characterStorage.onChange as jest.Mock).mock.calls.find(
      (call: any[]) => call[0] === 'settings',
    );
    const settingsListener = settingsListenerCall && settingsListenerCall[1];
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 5, shortcut: '1' }]);

    settingsListener?.({ attackCommand: 'atak' });
    kill(['', '1'] as unknown as RegExpMatchArray);

    expect(client.sendCommand).toHaveBeenCalledWith('atak ob_5');
  });

  test('kill alias in AW mode marks target', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 5, shortcut: '1' }]);
    setAttackMode?.('AW');
    expect(characterStorage.set).toHaveBeenLastCalledWith('attack_mode', 'AW');
    kill(['', '1'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'zabij ob_5');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wskaz ob_5 jako cel ataku', false);
  });

  test('kill alias in AWR mode orders attack', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 5, shortcut: '1' }]);
    setAttackMode?.('AWR');
    expect(characterStorage.set).toHaveBeenLastCalledWith('attack_mode', 'AWR');
    kill(['', '1'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'zabij ob_5');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wskaz ob_5 jako cel ataku', false);
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'rozkaz druzynie zaatakowac ob_5', false);
  });

  test('kill alias in AW mode without leadership only sends zabij', () => {
    client.TeamManager.isLeader.mockReturnValue(false);
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 5, shortcut: '1' }]);
    setAttackMode?.('AW');
    client.sendCommand.mockClear();
    kill(['', '1'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledTimes(1);
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_5');
  });

  test('kill alias resumes extra commands when becoming leader again', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 5, shortcut: '1' }]);
    setAttackMode?.('AWR');
    client.TeamManager.isLeader.mockReturnValue(false);
    kill(['', '1'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledTimes(1);
    client.sendCommand.mockClear();
    client.TeamManager.isLeader.mockReturnValue(true);
    kill(['', '1'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'zabij ob_5');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wskaz ob_5 jako cel ataku', false);
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'rozkaz druzynie zaatakowac ob_5', false);
  });

  test('zaslon alias sends zaslon with object number when target is in team', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 7, shortcut: 'A' }]);
    const mockMap = new Map();
    mockMap.set(7, { team: true });
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue(mockMap);
    shield(['', 'A'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('zaslon ob_7');
  });

  test('zaslon alias uses "zaslon przed" when target is not in team', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 9, shortcut: 'B' }]);
    const mockMap = new Map();
    mockMap.set(9, { team: false });
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue(mockMap);
    shield(['', 'B'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('zaslon przed ob_9');
  });

  test('/z alias attacks attack target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue(10);
    killTarget();
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_10');
  });

  test('/x alias attacks attack target with zaskocz', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue(11);
    surpriseTarget();
    expect(client.sendCommand).toHaveBeenCalledWith('zaskocz ob_11');
  });

  test('/zas alias covers defense target', () => {
    client.TeamManager.getDefenseTargetId.mockReturnValue(15);
    const mockMap = new Map();
    mockMap.set(15, { team: true });
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue(mockMap);
    shieldTarget();
    expect(client.sendCommand).toHaveBeenCalledWith('zaslon ob_15');
  });

  test('zap alias sends zapros with object number', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 8, shortcut: '2' }]);
    invite(['', '2'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('zapros ob_8');
  });

  test('/puszczaj toggles release flag', () => {
    toggle();
    expect(client.print).toHaveBeenCalledWith(
      expect.objectContaining({
        segments: expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('nie puszczam') }),
        ]),
      }),
    );
    toggle();
    expect(client.print).toHaveBeenLastCalledWith(
      expect.objectContaining({
        segments: expect.arrayContaining([
          expect.objectContaining({ text: 'Puszczanie zaslon: puszczam' }),
        ]),
      }),
    );
  });

  test('/zas alias with release first guards then releases', () => {
    client.TeamManager.getDefenseTargetId.mockReturnValue(15);
    const mockMap = new Map();
    mockMap.set(15, { team: true });
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue(mockMap);
    shieldTarget();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'zaslon ob_15');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'przestan zaslaniac');
  });

  test('/za2 alias sets group_cover during command', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 11, shortcut: 'C' }]);
    const mockMap = new Map();
    mockMap.set(11, { team: true });
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue(mockMap);
    shieldGroup(['', '2', 'C'] as unknown as RegExpMatchArray);
    expect(client.sendGMCP).toHaveBeenNthCalledWith(
      1,
      'char.options',
      { group_cover: 2 }
    );
    expect(client.sendCommand).toHaveBeenCalledWith('zaslon ob_11');
    expect(client.sendGMCP).toHaveBeenNthCalledWith(
      2,
      'char.options',
      { group_cover: 1 }
    );
  });

  test('/za2 alias restores group_cover to default when mirror has no value', () => {
    delete (gmcp.char as any).options.group_cover;
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 11, shortcut: 'C' }]);
    const mockMap = new Map();
    mockMap.set(11, { team: true });
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue(mockMap);
    shieldGroup(['', '2', 'C'] as unknown as RegExpMatchArray);
    expect(client.sendGMCP).toHaveBeenNthCalledWith(
      2,
      'char.options',
      { group_cover: 1 }
    );
  });

  test('/w alias withdraws behind object', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 17, shortcut: 'X' }]);
    withdraw(['', 'X'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('gzwycofaj sie za ob_17');
  });

  test('/w alias releases after withdraw when release is on', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 18, shortcut: 'Y' }]);
    withdraw(['', 'Y'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'gzwycofaj sie za ob_18');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'przestan kryc sie za zaslona');
  });

  test('/pro alias passes leadership to object', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 31, shortcut: 'A' }]);
    passLeadership(['', 'A'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('przekaz prowadzenie ob_31');
  });

  test('/prze alias breaks defense of attack target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('21');
    breakDefense();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'przestan kryc sie za zaslona');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'przelam obrone ob_21');
  });

  test('/prze alias breaks defense of given shortcut', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 30, shortcut: '1' }]);
    breakDefense(['', '1'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'przestan kryc sie za zaslona');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'przelam obrone ob_30');
  });

  test('/ra alias orders attack on object', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 25, shortcut: '3' }]);
    orderAttack(['', '3'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('rozkaz druzynie zaatakowac ob_25');
  });

  test('/ra alias orders attack on attack target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('40');
    orderAttackTarget();
    expect(client.sendCommand).toHaveBeenCalledWith('rozkaz druzynie zaatakowac ob_40');
  });

  test('/rz alias orders shield with object number', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 35, shortcut: 'A' }]);
    orderShield(['', 'A'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('rozkaz druzynie zaslonic ob_35');
  });

  test('/rz alias orders shield of defense target', () => {
    client.TeamManager.getDefenseTargetId.mockReturnValue('44');
    orderShieldTarget();
    expect(client.sendCommand).toHaveBeenCalledWith('rozkaz druzynie zaslonic ob_44');
  });

  test('/wa alias marks object as attack target', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 50, shortcut: '5' }]);
    markAttack(['', '5'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('wskaz ob_50 jako cel ataku');
  });

  test('/wz alias marks object as defense target', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 60, shortcut: 'B' }]);
    markDefense(['', 'B'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('wskaz ob_60 jako cel obrony');
  });
});
