import initGps from '../src/scripts/gps';
import Triggers from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  Map = { setMapRoomById: jest.fn(), currentRoom: { id: 10, areaId: 'Area' } } as any;
  sendEvent = jest.fn();
}

describe('gps triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initGps(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
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
    window.dispatchEvent(new CustomEvent('map-ready', { detail: { mapData, colors: [] } }));
  });

  test('gps lines set map location', () => {
    parse('l1');
    parse('l2');
    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(10);
    expect(client.sendEvent).toHaveBeenCalledWith('notify', { text: 'Map Sync: gps 10_0' });
  });
});
