import initGps from '../src/scripts/gps';
import Triggers from '../src/Triggers';
import appEventBus from '../src/events/app-event-bus';

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  Map = { setMapRoomById: jest.fn(), currentRoom: { id: 10, areaId: 'Area' }, onMapReady: (_cb: any) => {} } as any;
  sendEvent = jest.fn();
}

describe('gps triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    appEventBus.clear();
    client = new FakeClient();
    const mapData = [
      {
        areaName: 'Area',
        areaId: 'Area',
        rooms: [
          {
            id: 10,
            area: 1,
            x: 0,
            y: 0,
            z: 0,
            weight: 1,
            symbol: '',
            userData: { gps: JSON.stringify([{ gps_string_lines: ['l1', 'l2'], room_id: 10 }]) },
            customLines: {},
            stubs: [],
            doors: {},
            env: 0,
            exits: {},
            specialExits: {},
            hash: ''
          }
        ],
        labels: []
      }
    ];
    client.Map.onMapReady = (cb: any) => cb(mapData);
    initGps(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    client.Map.currentRoom.id = 1;
  });

  afterEach(() => {
    appEventBus.clear();
  });

  test('gps lines set map location when different from current', () => {
    const notifications: Array<{ text: string }> = [];
    const off = appEventBus.on('notify', payload => {
      notifications.push(payload as { text: string });
    });

    parse('l1');
    parse('l2');

    off();
    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
    expect(notifications).toEqual([{ text: 'Map Sync: gps 10_0' }]);
  });

  test('gps lines do not update when already at location', () => {
    jest.clearAllMocks();
    client.Map.currentRoom.id = 10;
    const notifications: Array<{ text: string }> = [];
    const off = appEventBus.on('notify', payload => {
      notifications.push(payload as { text: string });
    });

    parse('l1');
    parse('l2');

    off();
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
    expect(notifications).toEqual([]);
  });
});
