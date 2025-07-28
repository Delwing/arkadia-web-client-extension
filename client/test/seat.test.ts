import initSeat from '../src/scripts/seat';
import Triggers from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), clear: jest.fn(), newMessage: jest.fn() };
  sendCommand = jest.fn();
}

describe('seat trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    initSeat((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.clearAllMocks();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    (Math.random as jest.Mock).mockRestore();
  });

  test('binds random seat command', () => {
    parse('Gdzie chcesz usiasc? Przy drewnianym stole, przy drugim drewnianym stole czy przy trzecim drewnianym stole?');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('usiadz przy drugim drewnianym stole');
    callback();
    expect(client.sendCommand).toHaveBeenCalledWith('usiadz przy drugim drewnianym stole');
  });

  test('binds simple sit command', () => {
    parse('Zosia mowi do ciebie: A moze najpierw gdzies usiadziesz?');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('usiadz');
    callback();
    expect(client.sendCommand).toHaveBeenCalledWith('usiadz');
  });
});
