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
    map: mapOverrides,
    client: clientOverrides,
  }: {
    map?: Partial<{
      currentRoom: any;
      findPath: jest.Mock;
      getRoomById: jest.Mock;
      tryGetMapReader: jest.Mock;
      locationHistory: unknown[];
    }>;
    client?: Partial<any>;
  } = {}) {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    const baseMap = {
      currentRoom: { id: 1, exits: { north: 2 }, specialExits: {} },
      findPath: jest.fn(() => ['1', '2']),
      getRoomById: jest.fn(() => null),
      tryGetMapReader: jest.fn(() => ({ getRooms: jest.fn(() => []) })),
      locationHistory: [],
    };

    const map = { ...baseMap, ...(mapOverrides ?? {}) };

    const registerTrigger = jest.fn();
    const client: any = {
      Map: map,
      Triggers: { registerTrigger },
      addEventListener: jest.fn(() => () => {}),
      sendEvent: jest.fn(),
      sendCommand: jest.fn(),
      port: { postMessage: jest.fn() },
      suppressMapMoveEvent: false,
      setTempBind: jest.fn(),
      ...(clientOverrides ?? {}),
    };

    initIdz(client, aliases);
    return { client, aliases, registerTrigger };
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

  test('blocked direction trigger populates temp bind while walking', () => {
    const getRoomById = jest.fn((id: number) => {
      if (id === 1) {
        return { id: 1, exits: { north: 2 }, specialExits: {} };
      }
      return null;
    });

    const { client, aliases, registerTrigger } = setup({
      map: { getRoomById },
    });

    const alias = aliases.find(a => a.pattern.test('/idz 2'));
    expect(alias).toBeDefined();
    const match = '/idz 2'.match(alias!.pattern) as RegExpMatchArray;
    alias!.callback(match);

    const triggerCall = registerTrigger.mock.calls.find(([pattern]) =>
      pattern instanceof RegExp && pattern.test('Nie wiesz, w ktorym kierunku masz ruszyc...'),
    );
    expect(triggerCall).toBeDefined();

    const trigger = triggerCall![1] as Function;
    client.setTempBind.mockClear();

    trigger('raw', 'raw', [] as unknown as RegExpMatchArray, '');

    expect(client.setTempBind).toHaveBeenCalledWith(0, 'n');
  });

  test('blocked direction trigger ignores when no active path', () => {
    const { client, registerTrigger } = setup();

    const triggerCall = registerTrigger.mock.calls.find(([pattern]) =>
      pattern instanceof RegExp && pattern.test('Nie wiesz, w ktorym kierunku masz ruszyc...'),
    );
    expect(triggerCall).toBeDefined();

    const trigger = triggerCall![1] as Function;
    trigger('raw', 'raw', [] as unknown as RegExpMatchArray, '');

    expect(client.setTempBind).not.toHaveBeenCalled();
  });
});
