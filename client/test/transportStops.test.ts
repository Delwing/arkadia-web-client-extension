import initTransportStops from '../src/scripts/transportStops';
import Triggers from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  Map = { setMapRoomById: jest.fn() } as any;
  sendEvent = jest.fn();
  private listeners: Record<string, Function[]> = {};

  addEventListener(event: string, listener: Function) {
    (this.listeners[event] ||= []).push(listener);
    return () => {};
  }
}

describe('transport stop triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initTransportStops(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.clearAllMocks();
  });

  test('stop pattern does not register trigger', () => {
    const line = 'Bjorn krzyczy: Doplynelismy do przystani na wyspie Mekan! Mozna wysiadac!';
    parse(line);
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
  });
});
