import initGps from '@client/scripts/gps';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  Map = {
    setMapRoomById: jest.fn(),
    currentRoom: { id: 10, areaId: 'Area' },
    getAreaName: (_id: any) => 'Area',
    tryGetMapReader: () => null,
    onAreasChanged: (_cb: any) => () => {},
  } as any;

  /** Wire a map in and announce its areas, as MapHelper does on load. */
  useMap(mapData: any[]) {
    this.Map.tryGetMapReader = () => ({
      getArea: (areaId: number) =>
        mapData[areaId] ? { getRooms: () => mapData[areaId].rooms } : undefined,
    });
    this.Map.onAreasChanged = (cb: any) => { cb(mapData.map((_, i) => i)); return () => {}; };
  }
  sendEvent = jest.fn();
}

describe('gps triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
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
    client.useMap(mapData);
    initGps(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    client.Map.currentRoom.id = 1;
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

  test('gps with within_room_ids as strings matches when in correct room', () => {
    const mapData = [
      {
        areaName: 'Area',
        areaId: 'Area',
        rooms: [
          {
            id: 24415,
            area: 1,
            x: 0,
            y: 0,
            z: 0,
            weight: 1,
            symbol: '',
            userData: { gps: JSON.stringify([{
              gps_string_lines: ['test line'],
              room_id: 24415,
              within_room_ids: ['24733', '24734']  // strings, not numbers
            }]) },
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

    client = new FakeClient();
    client.useMap(mapData);
    initGps(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    client.Map.currentRoom.id = 24733;  // numeric ID

    jest.clearAllMocks();
    parse('test line');
    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(24415);
  });

  test('gps with within_room_ids does not match when in wrong room', () => {
    const mapData = [
      {
        areaName: 'Area',
        areaId: 'Area',
        rooms: [
          {
            id: 24415,
            area: 1,
            x: 0,
            y: 0,
            z: 0,
            weight: 1,
            symbol: '',
            userData: { gps: JSON.stringify([{
              gps_string_lines: ['test line'],
              room_id: 24415,
              within_room_ids: [24733, 24734]
            }]) },
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

    client = new FakeClient();
    client.useMap(mapData);
    initGps(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    client.Map.currentRoom.id = 99999;  // not in within_room_ids

    jest.clearAllMocks();
    parse('test line');
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
  });

  test('gps with 3 lines does not match if sequence is broken', () => {
    const mapData = [
      {
        areaName: 'Area',
        areaId: 'Area',
        rooms: [
          {
            id: 30,
            area: 1,
            x: 0,
            y: 0,
            z: 0,
            weight: 1,
            symbol: '',
            userData: { gps: JSON.stringify([{ gps_string_lines: ['line1', 'line2', 'line3'], room_id: 30 }]) },
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

    client = new FakeClient();
    client.useMap(mapData);
    initGps(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    client.Map.currentRoom.id = 1;

    jest.clearAllMocks();
    parse('line1');
    parse('some other line');
    parse('line3');
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
    expect(client.sendEvent).not.toHaveBeenCalled();
  });
});
