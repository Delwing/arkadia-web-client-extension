import initObjectAliases from '../src/scripts/objectAliases';
import { gmcp } from '../src/gmcp';

class FakeClient {
  ObjectManager = {
    getObjectsOnLocation: jest.fn(() => []),
  };
  TeamManager = {
    getAttackTargetId: jest.fn(() => undefined),
    getDefenseTargetId: jest.fn(() => undefined),
    getAccumulatedObjectsData: jest.fn(() => ({})),
  };
  sendCommand = jest.fn();
  releaseGuard = jest.fn(() => this.sendCommand('przestan zaslaniac'));
  sendGMCP = jest.fn();
  print = jest.fn();
  sendEvent = jest.fn();
  addEventListener = jest.fn();
}

describe('object aliases', () => {
  let client: FakeClient;
  let kill: (m: RegExpMatchArray) => void;
  let shield: (m: RegExpMatchArray) => void;
  let killTarget: () => void;
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

  beforeEach(() => {
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
    initObjectAliases((client as unknown) as any, aliases);
    kill = aliases[0].callback as any;
    shield = aliases[1].callback as any;
    killTarget = aliases[2].callback as any;
    shieldTarget = aliases[3].callback as any;
    invite = aliases[4].callback as any;
    toggle = aliases[7].callback as any;
    shieldGroup = aliases[8].callback as any;
    withdraw = aliases[9].callback as any;
    passLeadership = aliases[10].callback as any;
    breakDefense = aliases[11].callback as any;
    orderAttack = aliases[12].callback as any;
    orderAttackTarget = aliases[13].callback as any;
    orderShield = aliases[14].callback as any;
    orderShieldTarget = aliases[15].callback as any;
    markAttack = aliases[16].callback as any;
    markDefense = aliases[17].callback as any;
    (global as any).Input = { send: jest.fn() };
    (window as any).gmcp = gmcp;
    gmcp.char = { options: { group_cover: 1 } } as any;
  });

  test('kill alias sends zabij with object number', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 5, shortcut: '1' }]);
    kill(['', '1'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_5');
  });

  test('zaslon alias sends zaslon with object number when target is in team', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 7, shortcut: 'A' }]);
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue({ 7: { team: true } });
    shield(['', 'A'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('zaslon ob_7');
  });

  test('zaslon alias uses "zaslon przed" when target is not in team', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 9, shortcut: 'B' }]);
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue({ 9: { team: false } });
    shield(['', 'B'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('zaslon przed ob_9');
  });

  test('/z alias attacks attack target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('10');
    killTarget();
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_10');
  });

  test('/zas alias covers defense target', () => {
    client.TeamManager.getDefenseTargetId.mockReturnValue('15');
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue({ 15: { team: true } });
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
    expect(client.print).toHaveBeenCalledWith(expect.stringContaining('OFF'));
    toggle();
    expect(client.print).toHaveBeenCalledWith(expect.stringContaining('ON'));
  });

  test('/zas alias with release first guards then releases', () => {
    client.TeamManager.getDefenseTargetId.mockReturnValue('15');
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue({ 15: { team: true } });
    shieldTarget();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'zaslon ob_15');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'przestan zaslaniac');
  });

  test('/za2 alias sets group_cover during command', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 11, shortcut: 'C' }]);
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue({ 11: { team: true } });
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

  test('/w alias withdraws behind object', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 17, shortcut: 'X' }]);
    withdraw(['', 'X'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('gzwycofaj sie za ob_17');
  });

  test('/w alias releases after withdraw when release is on', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 18, shortcut: 'Y' }]);
    withdraw(['', 'Y'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'gzwycofaj sie za ob_18');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'przestan zaslaniac');
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
    expect(client.sendCommand).toHaveBeenCalledWith('rozkaz zaatakowac ob_25');
  });

  test('/ra alias orders attack on attack target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('40');
    orderAttackTarget();
    expect(client.sendCommand).toHaveBeenCalledWith('rozkaz zaatakowac ob_40');
  });

  test('/rz alias orders shield with object number', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 35, shortcut: 'A' }]);
    orderShield(['', 'A'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('rozkaz zaslonic ob_35');
  });

  test('/rz alias orders shield of defense target', () => {
    client.TeamManager.getDefenseTargetId.mockReturnValue('44');
    orderShieldTarget();
    expect(client.sendCommand).toHaveBeenCalledWith('rozkaz zaslonic ob_44');
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
