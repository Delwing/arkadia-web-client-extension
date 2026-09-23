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
    const listeners: Record<string, Function[]> = {};
    const client: any = {
      Map: {
        currentRoom: { id: 1, exits: { north: 2 }, specialExits: {} },
        findPath: jest.fn(() => ['1', '2']),
        getRoomById: jest.fn(() => null),
        resolveGmcpRoom: jest.fn((map) => map?.roomId),
        tryGetMapReader: jest.fn(() => ({ getRooms: jest.fn(() => []) })),
      },
      on: jest.fn((event: string, callback: Function) => {
        (listeners[event] ||= []).push(callback);
        return () => {};
      }),
      fire: (event: string, detail?: unknown) => {
        for (const callback of listeners[event] ?? []) callback(detail);
      },
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

  test('replans from the GMCP-confirmed room after an alternative exit', () => {
    const { client, aliases } = setup();
    const rooms: Record<number, any> = {
      1: { id: 1, exits: { north: 2 }, specialExits: {} },
      4: { id: 4, exits: { east: 5 }, specialExits: {} },
      5: { id: 5, exits: { south: 3 }, specialExits: {} },
    };
    client.Map.getRoomById.mockImplementation((id: number) => rooms[id] ?? null);
    client.Map.findPath
      .mockReturnValueOnce(['1', '2', '3'])
      .mockReturnValueOnce(['4', '5', '3'])
      .mockReturnValueOnce(['5', '3']);

    const alias = aliases.find(a => a.pattern.test('/idz 3'))!;
    alias.callback('/idz 3'.match(alias.pattern));

    jest.runOnlyPendingTimers();
    expect(client.sendCommand).toHaveBeenLastCalledWith('n');

    client.fire('gmcp.room.info', { map: { roomId: 4 } });
    expect(client.Map.findPath).toHaveBeenLastCalledWith(4, 3);
    jest.runOnlyPendingTimers();
    expect(client.sendCommand).toHaveBeenLastCalledWith('e');

    client.fire('gmcp.room.info', { map: { roomId: 5 } });
    expect(client.Map.findPath).toHaveBeenLastCalledWith(5, 3);
    jest.runOnlyPendingTimers();
    expect(client.sendCommand).toHaveBeenLastCalledWith('s');

    const updatesBeforeConfirmation = client.sendEvent.mock.calls
      .filter(([event]: [string]) => event === 'walker.update');
    expect(updatesBeforeConfirmation.at(-1)?.[1]).toMatchObject({ active: true, target: 3 });

    client.fire('gmcp.room.info', { map: { roomId: 3 } });
    const updates = client.sendEvent.mock.calls
      .filter(([event]: [string]) => event === 'walker.update');
    expect(updates.at(-1)?.[1]).toMatchObject({ active: false, paused: false, target: null });
    expect(client.sendEvent).toHaveBeenCalledWith('notify', { text: '[WALK] reached 3' });
  });
});
