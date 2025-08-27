import initSkills from '../src/scripts/skills';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { colorString, findClosestColor } from '../src/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('skills trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initSkills((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('replaces descriptor with padded level and colors skill and level', () => {
    const line = 'akrobatyka: ledwo';
    const colorCode = findClosestColor('#ff0000');
    const expected =
      colorString('akrobatyka', colorCode) + ': ' + colorString('[ 1/10]', colorCode);
    const result = parse(line);
    expect(result).toBe(expected);
    expect(stripAnsiCodes(result)).toBe('akrobatyka: [ 1/10]');
  });

  test('handles max level without padding', () => {
    const line = 'miecze: mistrzowsko';
    const colorCode = findClosestColor('#87ceeb');
    const expected =
      colorString('miecze', colorCode) + ': ' + colorString('[10/10]', colorCode);
    const result = parse(line);
    expect(result).toBe(expected);
    expect(stripAnsiCodes(result)).toBe('miecze: [10/10]');
  });
});
