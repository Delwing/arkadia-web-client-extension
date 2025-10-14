import initLocalizers from '../src/scripts/localizers';
import Triggers from '../src/Triggers';
import appEventBus from '../src/events/app-event-bus';

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  Map = { setMapRoomById: jest.fn() } as any;
  sendEvent = jest.fn();
}

describe('localizers triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    appEventBus.clear();
    client = new FakeClient();
    emitSpy = jest.spyOn(appEventBus, 'emit');
    initLocalizers(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  test('single line localizer sets map location', () => {
    parse('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, placyk w Grabowej Buchcie');
    expect(client.Map.setMapRoomById).toHaveBeenCalledWith(3525);
    expect(appEventBus.emit).toHaveBeenCalledWith('notify', { text: 'Map Sync: localizer 3525' });
  });

  test('single line localizer without proper parent does not move map', () => {
    parse('Postoj, placyk w Grabowej Buchcie');
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
    expect(appEventBus.emit).not.toHaveBeenCalled();
  });
});
