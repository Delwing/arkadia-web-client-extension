import MapHelper from '../src/MapHelper';

jest.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

describe('MapHelper setMapRoomById', () => {
  const createClient = () => ({
    addEventListener: () => {},
    sendEvent: jest.fn(),
    suppressMapMoveEvent: false,
  });

  test('replaces history with the new room id', () => {
    const client: any = createClient();
    const map = new MapHelper(client);
    map.locationHistory = [1, 2, 3];

    map.setMapRoomById(10);

    expect(map.locationHistory).toEqual([10]);
  });

  test('replaces history even when staying in the same room', () => {
    const client: any = createClient();
    const map = new MapHelper(client);
    map.currentRoom = { id: 5 } as any;
    map.locationHistory = [5, 6, 7];
    const callsBefore = client.sendEvent.mock.calls.length;

    map.setMapRoomById(5);

    expect(map.locationHistory).toEqual([5]);
    expect(client.sendEvent).toHaveBeenCalledTimes(callsBefore);
  });
});
