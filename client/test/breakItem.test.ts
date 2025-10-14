import initBreakItem from '../src/scripts/breakItem';
import Triggers from '../src/Triggers';
import { colorString, findClosestColor } from '../src/Colors';
import appEventBus from '../src/events/app-event-bus';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn() } as any;
  playSound = jest.fn();
  sendCommand = jest.fn();
  prefix = (line: string, prefix: string) => prefix + line;
}

describe('break item triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let events: { text: string; command?: string }[];
  let off: () => void;

  beforeEach(() => {
    appEventBus.clear();
    client = new FakeClient();
    initBreakItem((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.clearAllMocks();
    events = [];
    off = appEventBus.on('breakItem', payload => {
      events.push(payload);
    });
  });

  afterEach(() => {
    off();
    appEventBus.clear();
  });

  test('replaces line and beeps', () => {
    const line = 'Nagle topor rozpruwa sie.';
    const result = parse(line);
    expect(client.playSound).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ text: line, command: undefined }]);
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
