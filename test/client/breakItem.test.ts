import initBreakItem from '@client/scripts/breakItem';
import Triggers from '@client/Triggers';
import { colorString, findClosestColor } from '@modules/core/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn() } as any;
  sendCommand = jest.fn();
  sendEvent = jest.fn();
  prefix = (line: string, prefix: string) => prefix + line;
}

describe('break item triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initBreakItem((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.clearAllMocks();
  });

  test('replaces line and beeps', () => {
    const line = 'Nagle topor rozpruwa sie.';
    const result = parse(line);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toEqual({ key: 'beep' });
    expect(client.sendEvent).toHaveBeenCalledWith('breakItem', { text: line, command: undefined });
    const color = findClosestColor('#ff6347');
    const expected = `\n\n${client.prefix(line, colorString('[  SPRZET  ] ', color))}\n\n`;
    expect(result).toBe(expected);
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
});
