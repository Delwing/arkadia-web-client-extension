import initLocalizers from '../src/scripts/localizers';
import Triggers from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  Map = { setMapRoomById: jest.fn() } as any;
  sendEvent = jest.fn();
}

describe('localizers triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initLocalizers(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.clearAllMocks();
  });

  test('single line localizer sets map location', () => {
    parse('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, placyk w Grabowej Buchcie');
    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(3525);
    expect(client.sendEvent).toHaveBeenCalledWith('notify', { text: 'Map Sync: localizer 3525' });
  });

  test('single line localizer without proper parent does not move map', () => {
    parse('Postoj, placyk w Grabowej Buchcie');
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
    expect(client.sendEvent).not.toHaveBeenCalled();
  });
});
