import initBreakItem from '@client/scripts/breakItem';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn() } as any;
  sendCommand = jest.fn();
  sendEvent = jest.fn();
  prefix = (line: string, prefix: string) => prefix + line;
}

describe('break item triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initBreakItem((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    jest.clearAllMocks();
  });

  test('replaces line and beeps', () => {
    const line = 'Nagle topor rozpruwa sie.';
    const result = parse(line);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toBe('gear');
    expect(client.sendEvent).toHaveBeenCalledWith('breakItem', { text: line, command: undefined });
    expect(result?.text).toContain('[  SPRZET  ]');
    expect(result?.text).toContain(line);
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
  });

  test('binds weapon command', () => {
    const line = 'Miecz bojowy peka!';
    parse(line);
    const call = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(call[0]).toContain('odloz zlamana bron');
    const cb = call[1] as Function;
    cb();
    expect(client.sendCommand).toHaveBeenCalledWith('odloz zlamana bron');
  });

  test('binds armor command', () => {
    const line = 'Stalowa zbroja rozpada sie!';
    parse(line);
    const call = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(call[0]).toContain('odloz zniszczona zbroje');
    const cb = call[1] as Function;
    cb();
    expect(client.sendCommand).toHaveBeenCalledWith('odloz zniszczona zbroje');
  });

  test('does not bind or warn for other person armor breaking', () => {
    const line = 'Czarna blyszczaca zbroja plytowa Apoliosa rozpada sie!';
    const result = parse(line);
    expect(result?.text).toContain('[  SPRZET  ]');
    expect(client.sendEvent).toHaveBeenCalledWith('sound:category', 'gear');
    expect(client.sendEvent).not.toHaveBeenCalledWith('breakItem', expect.anything());
    expect(client.FunctionalBind.set).not.toHaveBeenCalled();
  });

  test('does not bind or warn for other person weapon breaking', () => {
    const line = 'Stalowy miecz Apoliosa peka!';
    const result = parse(line);
    expect(result?.text).toContain('[  SPRZET  ]');
    expect(client.sendEvent).toHaveBeenCalledWith('sound:category', 'gear');
    expect(client.sendEvent).not.toHaveBeenCalledWith('breakItem', expect.anything());
    expect(client.FunctionalBind.set).not.toHaveBeenCalled();
  });

  test.each([
    'Odkladasz zniszczona zbroje plytowa.',
    'Odkladasz zniszczony helm.',
    'Odkladasz zniszczone buty.',
    'Odkladasz zlamana bron.',
    'Odkladasz zlamany miecz.',
    'Odkladasz zlamane kopie.',
  ])('clears warning on: %s', (line) => {
    parse(line);
    expect(client.sendEvent).toHaveBeenCalledWith('breakItem', null);
  });
});
