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

  test('colors skill name and level with padding before bracket', () => {
    const line = 'akrobatyka: ledwo';
    const colorCode = findClosestColor('#ff0000');
    const expected =
      colorString('akrobatyka:', colorCode) +
      ' ledwo ' +
      colorString(' [1/10]', colorCode);
    const result = parse(line);
    expect(result).toBe(expected);
    expect(stripAnsiCodes(result)).toBe('akrobatyka: ledwo  [1/10]');
  });

  test('uses yellow for mid levels', () => {
    const line = 'ocena przeciwnika: dobrze';
    const colorCode = findClosestColor('#ffff00');
    const expected =
      colorString('ocena przeciwnika:', colorCode) +
      ' dobrze ' +
      colorString(' [6/10]', colorCode);
    const result = parse(line);
    expect(result).toBe(expected);
    expect(stripAnsiCodes(result)).toBe('ocena przeciwnika: dobrze  [6/10]');
  });

  test('keeps green for level nine', () => {
    const line = 'plywanie: perfekcyjnie';
    const colorCode = findClosestColor('#00ff00');
    const expected =
      colorString('plywanie:', colorCode) +
      ' perfekcyjnie ' +
      colorString(' [9/10]', colorCode);
    const result = parse(line);
    expect(result).toBe(expected);
    expect(stripAnsiCodes(result)).toBe('plywanie: perfekcyjnie  [9/10]');
  });

  test('uses SkyBlue only for max level', () => {
    const line = 'miecze: mistrzowsko';
    const colorCode = findClosestColor('#87ceeb');
    const expected =
      colorString('miecze:', colorCode) +
      ' mistrzowsko ' +
      colorString('[10/10]', colorCode);
    const result = parse(line);
    expect(result).toBe(expected);
    expect(stripAnsiCodes(result)).toBe('miecze: mistrzowsko [10/10]');
  });
});
