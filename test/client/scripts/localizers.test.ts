import initLocalizers from '@client/scripts/localizers';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  Map = { setMapRoomById: jest.fn(), refreshPosition: false } as any;
  sendEvent = jest.fn();
}

describe('localizers triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initLocalizers(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    jest.clearAllMocks();
    client.Map.refreshPosition = false;
  });

  test('klatka drzwi trigger sets refreshPosition', () => {
    parse('Otworzyly sie drzwi klatki.');
    expect(client.Map.refreshPosition).toBe(true);
  });

  test('unrelated line does not set refreshPosition', () => {
    parse('Cos innego sie wydarzylo.');
    expect(client.Map.refreshPosition).toBe(false);
  });
});
