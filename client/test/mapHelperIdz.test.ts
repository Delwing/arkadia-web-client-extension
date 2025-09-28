import MapHelper from '../src/MapHelper';

jest.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

describe('MapHelper parseCommand', () => {
  test('idz chooses alternate exit', () => {
    const client: any = { addEventListener: () => {}, sendEvent: () => {} };
    const map = new MapHelper(client);
    map.currentRoom = { exits: { north: 1, south: 3 } } as any;
    map.locationHistory = [1, 2];
    const res = map.parseCommand('idz');
    expect(res).toBe('s');
  });
});
