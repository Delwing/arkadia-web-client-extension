import initIdz from '../src/scripts/idz';
import appEventBus from '../src/events/app-event-bus';

jest.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

describe('idz walking', () => {
  beforeEach(() => {
    appEventBus.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    appEventBus.clear();
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
      addEventListener: jest.fn(() => () => {}),
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

    const leadToEvents: Array<number | undefined> = [];
    const off = appEventBus.on('leadTo', value => {
      leadToEvents.push(value as number | undefined);
    });

    alias!.callback(match);

    off();

    expect(client.Map.findPath).toHaveBeenCalledWith(1, 2);
    expect(client.Map.getRoomById).toHaveBeenCalled();
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(leadToEvents).toEqual([2, undefined]);
  });
});
