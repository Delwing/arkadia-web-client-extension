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
    expect(client.sendEvent).toHaveBeenCalledWith('notify', { text: 'Map Sync: gps 10_1' });
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

/**
 * The map file is shared with the Mudlet package and the map editor, so these
 * cover what an entry is allowed to say and how a sequence is recognised —
 * substring matching, per-line regex, and the line span.
 */
describe('gps entry matching', () => {
  const room = (id: number, entries: any[]) => ({
    id,
    area: 1,
    x: 0, y: 0, z: 0,
    weight: 1,
    symbol: '',
    userData: { gps: JSON.stringify(entries) },
    customLines: {}, stubs: [], doors: {}, env: 0, exits: {}, specialExits: {}, hash: ''
  });

  function withRooms(rooms: any[], currentRoomId = 1) {
    const client = new FakeClient();
    client.useMap([{ areaName: 'Area', areaId: 'Area', rooms, labels: [] }]);
    initGps(client as unknown as any);
    client.Map.currentRoom.id = currentRoomId;
    return {
      client,
      parse: (line: string) =>
        Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), ''),
    };
  }

  test('matches an entry that is only part of the line, on every line of the sequence', () => {
    const { client, parse } = withRooms([room(10, [{ gps_string_lines: ['l1', 'l2'], room_id: 10 }])]);

    parse('przed l1 i dalej');
    parse('a tutaj l2 na koncu');

    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
  });

  test('ignores whitespace the game leaves around a following line', () => {
    const { client, parse } = withRooms([room(10, [{ gps_string_lines: ['l1', 'l2'], room_id: 10 }])]);

    parse('l1');
    parse('  l2   ');

    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
  });

  test('treats a line marked regex as a pattern', () => {
    const { client, parse } = withRooms([room(10, [{
      gps_string_lines: ['Kuznia w [a-z]+\.', 'Sa tutaj [a-z]+ widoczne wyjscia\.'],
      gps_line_modes: ['regex', 'regex'],
      room_id: 10,
    }])]);

    parse('Kuznia w rinde.');
    parse('Sa tutaj dwa widoczne wyjscia.');

    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
  });

  test('mixes a literal line with a regex line', () => {
    const { client, parse } = withRooms([room(10, [{
      gps_string_lines: ['Kuznia.', 'wyjscia: [a-z, ]+\.'],
      gps_line_modes: [null, 'regex'],
      room_id: 10,
    }])]);

    parse('Kuznia.');
    parse('Sa tutaj dwa widoczne wyjscia: polnoc, poludnie.');

    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
  });

  test('drops an entry whose pattern does not compile, keeping the rest of the room', () => {
    const { client, parse } = withRooms([room(10, [
      { gps_string_lines: ['Kuznia ('], gps_line_modes: ['regex'], room_id: 10 },
      { gps_string_lines: ['Trakt.'], room_id: 10 },
    ])]);

    parse('Kuznia (');
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();

    parse('Trakt.');
    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
  });

  test('requires consecutive lines when no line span is given', () => {
    const { client, parse } = withRooms([room(10, [{ gps_string_lines: ['l1', 'l2'], room_id: 10 }])]);

    parse('l1');
    parse('cos zupelnie innego');
    parse('l2');

    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
  });

  test('ignores line_delta, which never widened anything on the Mudlet side either', () => {
    const { client, parse } = withRooms([room(10, [{
      gps_string_lines: ['l1', 'l2'],
      line_delta: 4,
      room_id: 10,
    }])]);

    parse('l1');
    parse('cos innego');
    parse('l2');
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();

    parse('l1');
    parse('l2');
    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
  });

  test('lets only one entry claim a line when two of them match it', () => {
    const { client, parse } = withRooms([
      room(10, [{ gps_string_lines: ['Przed mostem.'], room_id: 10 }]),
      room(11, [{ gps_string_lines: ['Przed mostem.'], room_id: 11 }]),
    ]);

    parse('Przed mostem.');

    expect(client.Map.setMapRoomById).toHaveBeenCalledTimes(1);
    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
  });

  test('still lets the next line sync', () => {
    const { client, parse } = withRooms([
      room(10, [{ gps_string_lines: ['Przed mostem.'], room_id: 10 }]),
      room(11, [{ gps_string_lines: ['Za mostem.'], room_id: 11 }]),
    ]);

    parse('Przed mostem.');
    parse('Za mostem.');

    expect(client.Map.setMapRoomById).toHaveBeenNthCalledWith(1, 10);
    expect(client.Map.setMapRoomById).toHaveBeenNthCalledWith(2, 11);
  });
});
