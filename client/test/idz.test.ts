import initIdz from '../src/scripts/idz';

jest.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

describe('idz walking', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup({
    map: mapOverrides = {},
    client: clientOverrides = {},
  }: {
    map?: Record<string, any>;
    client?: Record<string, any>;
  } = {}) {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    const client: any = {
      Map: {
        currentRoom: { id: 1, exits: { north: 2 }, specialExits: {} },
        findPath: jest.fn(() => ['1', '2']),
        getRoomById: jest.fn(() => null),
        tryGetMapReader: jest.fn(() => ({ getRooms: jest.fn(() => []) })),
        ...mapOverrides,
      },
      addEventListener: jest.fn(() => () => {}),
      sendEvent: jest.fn(),
      sendCommand: jest.fn(),
      setTempBind: jest.fn(),
      port: { postMessage: jest.fn() },
      suppressMapMoveEvent: false,
      Triggers: { registerTrigger: jest.fn() },
      ...clientOverrides,
    };

    initIdz(client, aliases);
    return { client, aliases };
  }

  test('aborts scheduled walk when room lookup fails', () => {
    const { client, aliases } = setup();
    const alias = aliases.find(a => a.pattern.test('/idz 2'));
    expect(alias).toBeDefined();

    const match = '/idz 2'.match(alias!.pattern);
    expect(match).not.toBeNull();

    alias!.callback(match);

    expect(client.Map.findPath).toHaveBeenCalledWith(1, 2);
    expect(client.Map.getRoomById).toHaveBeenCalled();
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(client.sendEvent).toHaveBeenCalledWith('leadTo', 2);
    expect(client.sendEvent).toHaveBeenCalledWith('leadTo');
  });

  test('creates temp bind for next step when blocked message appears', () => {
    const getRoomById = jest.fn(() => ({ exits: { north: 2 }, specialExits: {} }));
    const { client, aliases } = setup({
      map: {
        getRoomById,
      },
    });

    const triggerCall = client.Triggers.registerTrigger.mock.calls.find(
      ([pattern]) => pattern instanceof RegExp && pattern.test('Nie wiesz, w ktorym kierunku masz ruszyc...'),
    );
    expect(triggerCall).toBeDefined();
    const trigger = triggerCall![1];

    trigger('Nie wiesz, w ktorym kierunku masz ruszyc...', 'Nie wiesz, w ktorym kierunku masz ruszyc...', []);
    expect(client.setTempBind).not.toHaveBeenCalled();

    const alias = aliases.find(a => a.pattern.test('/idz 2'));
    expect(alias).toBeDefined();
    const match = '/idz 2'.match(alias!.pattern);
    expect(match).not.toBeNull();
    alias!.callback(match);

    client.setTempBind.mockClear();

    trigger('Nie wiesz, w ktorym kierunku masz ruszyc...', 'Nie wiesz, w ktorym kierunku masz ruszyc...', []);
    expect(client.setTempBind).toHaveBeenCalledWith(0, 'n');
  });
});
