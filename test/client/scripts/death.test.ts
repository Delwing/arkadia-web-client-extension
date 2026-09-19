import initDeath from '@client/scripts/death';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  sendEvent = jest.fn();
}

describe('player death', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initDeath((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    jest.clearAllMocks();
  });

  test('raises playerDeath on the death line', () => {
    parse('Umierasz.');
    expect(client.sendEvent).toHaveBeenCalledWith('playerDeath');
  });

  test('leaves the line as it was', () => {
    const result = parse('Umierasz.');
    expect(result?.text).toBe('Umierasz.');
  });

  test.each([
    'Umierasz z glodu.',
    'Umierasz',
    'Powoli umierasz.',
    'Ork umiera.',
    'Zabiles orka.',
  ])('stays quiet on %s', (line) => {
    parse(line);
    expect(client.sendEvent).not.toHaveBeenCalled();
  });
});
