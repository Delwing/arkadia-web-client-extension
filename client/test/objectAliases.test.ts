import initObjectAliases from '../src/scripts/objectAliases';

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
  print = jest.fn();
}

describe('object aliases', () => {
  let client: FakeClient;
  let kill: (m: RegExpMatchArray) => void;
  let shield: (m: RegExpMatchArray) => void;
  let killTarget: () => void;
  let shieldTarget: () => void;
  let invite: (m: RegExpMatchArray) => void;
  let toggle: () => void;

  beforeEach(() => {
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
    initObjectAliases((client as unknown) as any, aliases);
    kill = aliases[0].callback as any;
    shield = aliases[1].callback as any;
    killTarget = aliases[2].callback as any;
    shieldTarget = aliases[3].callback as any;
    invite = aliases[4].callback as any;
    toggle = aliases[9].callback as any;
    (global as any).Input = { send: jest.fn() };
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
    expect(client.print).toHaveBeenCalledWith(expect.stringContaining('ON'));
    toggle();
    expect(client.print).toHaveBeenCalledWith(expect.stringContaining('OFF'));
  });

  test('/zas alias with release first guards then releases', () => {
    client.TeamManager.getDefenseTargetId.mockReturnValue('15');
    client.TeamManager.getAccumulatedObjectsData.mockReturnValue({ 15: { team: true } });
    toggle();
    shieldTarget();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'zaslon ob_15');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'przestan zaslaniac');
  });
});
