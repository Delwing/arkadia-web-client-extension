import initMountain from '../src/scripts/mountain';
import Triggers from '../src/Triggers';
import { findClosestColor } from '../src/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  Map = { moveBack: jest.fn() };
}

describe('mountain triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  const yellow = findClosestColor('#ffff00');
  const prefix = `\x1B[22;38;5;${yellow}m`;
  const suffix = '\x1B[0m';

  beforeEach(() => {
    client = new FakeClient();
    initMountain((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('colors descending line yellow', () => {
    const result = parse('Zaczynasz schodzic na dol.');
    expect(result).toBe(prefix + 'Zaczynasz schodzic na dol.' + suffix);
  });

  test('colors climbing line yellow', () => {
    const result = parse('Zaczynasz wspinac sie');
    expect(result).toBe(prefix + 'Zaczynasz wspinac sie' + suffix);
  });

  test('colors falling line yellow and moves back when climbing up', () => {
    parse('Zaczynasz wspinac sie');
    const result = parse('Odpadasz od sciany i lecisz w dol');
    expect(result).toBe(prefix + 'Odpadasz od sciany i lecisz w dol' + suffix);
    expect(client.Map.moveBack).toHaveBeenCalled();
  });
});
