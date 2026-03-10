import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import initGates from '@client/scripts/gates';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), setCategory: jest.fn(), clear: jest.fn(), clearCategory: jest.fn(), newMessage: jest.fn() };
  on = jest.fn();
  sendCommand = jest.fn();
}

describe('gates triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    jest.clearAllMocks();
    initGates((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('binding is set and callback sends command', () => {
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledWith('gates', null, expect.any(Function));
    const initCb = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0][2];
    initCb();
    expect(client.sendCommand).toHaveBeenCalledWith('uderz we wrota');

    parse('Probujesz otworzyc masywne wrota.');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(2);
    const [category, label, cb] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[1];
    expect(category).toBe('gates');
    expect(label).toBe('uderz we wrota');
    cb();
    expect(client.sendCommand).toHaveBeenCalledTimes(2);
  });

  test('niewielka furtka pattern', () => {
    parse('Probujesz otworzyc niewielka furtke.');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(2);
  });
});
