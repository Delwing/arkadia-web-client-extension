import initIdz from '@client/scripts/idz';

vi.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

describe('idz walking', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup() {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    const client: any = {
      Map: {
        currentRoom: { id: 1, exits: { north: 2 }, specialExits: {} },
        findPath: jest.fn(() => ['1', '2']),
        getRoomById: jest.fn(() => null),
        tryGetMapReader: jest.fn(() => ({ getRooms: jest.fn(() => []) })),
      },
      on: jest.fn(() => () => {}),
      sendEvent: jest.fn(),
      sendCommand: jest.fn(),
      port: { postMessage: jest.fn() },
      suppressMapMoveEvent: false,
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
    expect(client.sendEvent).toHaveBeenCalledWith('clearLeadTo');
  });
});
