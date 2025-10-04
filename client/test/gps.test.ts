import initGps from '../src/scripts/gps';
import Triggers from '../src/Triggers';

class FakeMap {
  setMapRoomById = jest.fn();
  currentRoom = { id: 10, areaId: 'Area' } as any;
  private readyCallback: ((payload: { mapData: MapData.Map; colors: any }) => void) | null = null;

  onReady(callback: (payload: { mapData: MapData.Map; colors: any }) => void) {
    this.readyCallback = callback;
  }

  triggerReady(mapData: MapData.Map, colors: any = []) {
    this.readyCallback?.({ mapData, colors });
  }
}

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  Map = new FakeMap();
  sendEvent = jest.fn();
}

describe('gps triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initGps(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    client.Map.currentRoom.id = 1;
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
    client.Map.triggerReady(mapData as any);
  });

  test('gps lines set map location when different from current', () => {
    parse('l1');
    parse('l2');
    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
    expect(client.sendEvent).toHaveBeenCalledWith('notify', { text: 'Map Sync: gps 10_0' });
  });

  test('gps lines do not update when already at location', () => {
    jest.clearAllMocks();
    client.Map.currentRoom.id = 10;
    parse('l1');
    parse('l2');
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
    expect(client.sendEvent).not.toHaveBeenCalled();
  });
});
