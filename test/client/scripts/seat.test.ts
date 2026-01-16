import initSeat from '@client/scripts/seat';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), clear: jest.fn(), newMessage: jest.fn() };
  sendCommand = jest.fn();
}

describe('seat trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    initSeat((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    jest.clearAllMocks();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    (Math.random as jest.Mock).mockRestore();
  });

  test('binds random seat command and lowercases it', () => {
    parse('Gdzie chcesz usiasc? Przy DREWNIANYM stole, PRZY DRUGIM stole czy PRZY TRZECIM stole?');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('usiadz przy drugim stole');
    callback();
    expect(client.sendCommand).toHaveBeenCalledWith('usiadz przy drugim stole');
  });

  test('handles "lub" delimiter', () => {
    parse('Gdzie chcesz usiasc? Przy stole lub przy oknie?');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('usiadz przy oknie');
    callback();
    expect(client.sendCommand).toHaveBeenCalledWith('usiadz przy oknie');
  });

  test('binds simple sit command', () => {
    parse('Zosia mowi do ciebie: A moze najpierw gdzies usiadziesz?');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('usiadz');
    callback();
    expect(client.sendCommand).toHaveBeenCalledWith('usiadz');
  });

  test('does not split on "czy" inside words like "czystym"', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    parse('Gdzie chcesz usiasc? Przy czystym stole, przy drugim czystym stole czy przy trzecim czystym stole?');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('usiadz przy czystym stole');
    callback();
    expect(client.sendCommand).toHaveBeenCalledWith('usiadz przy czystym stole');
  });

  test('returns buffer with clickable options', () => {
    const result = parse('Gdzie chcesz usiasc? Przy stole czy przy oknie?');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
    const segments = (result as AnsiAwareBuffer).toHyperlinkSegments();
    const clickableSegments = segments.filter(s => s.hyperlink?.onClick);
    expect(clickableSegments.length).toBe(2);
    // Click first option
    clickableSegments[0].hyperlink?.onClick?.({} as MouseEvent);
    expect(client.sendCommand).toHaveBeenCalledWith('usiadz przy stole');
    // Click second option
    clickableSegments[1].hyperlink?.onClick?.({} as MouseEvent);
    expect(client.sendCommand).toHaveBeenCalledWith('usiadz przy oknie');
  });
});
