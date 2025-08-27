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

  test('keeps descriptor and appends padded, colored level', () => {
    const line = 'akrobatyka: pobieznie';
    const colorCode = findClosestColor('#ffa500');
    const expected =
      colorString('akrobatyka:', colorCode) +
      ' ' +
      'pobieznie' +
      ' ' +
      colorString('[3/10]', colorCode);
    const result = parse(line);
    expect(result).toBe(expected);
    expect(stripAnsiCodes(result)).toBe('akrobatyka: pobieznie [3/10]');
  });

  test('maps levels to red/orange/yellow/green/SkyBlue', () => {
    const samples: [string, string, string, string][] = [
      ['ledwo', '#ff0000', '[1/10]', 'tarcza'],
      ['zadowalajaco', '#ffa500', '[4/10]', 'blokowanie'],
      ['niezle', '#ffff00', '[5/10]', 'ocena obiektu'],
      ['doskonale', '#00ff00', '[8/10]', 'miecze'],
      ['mistrzowsko', '#87ceeb', '[10/10]', 'silny cios'],
    ];

    for (const [desc, hex, bracket, skill] of samples) {
      const line = `${skill}: ${desc}`;
      const colorCode = findClosestColor(hex);
      const expected =
        colorString(`${skill}:`, colorCode) +
        ' ' +
        `${desc}` +
        ' ' +
        colorString(bracket, colorCode);
      const result = parse(line);
      expect(result).toBe(expected);
      expect(stripAnsiCodes(result)).toBe(`${skill}: ${desc} ${bracket}`);
    }
  });

  test('colors multiple skills in one line', () => {
    const line = 'akrobatyka: pobieznie           miecze: doskonale';
    const orange = findClosestColor('#ffa500');
    const green = findClosestColor('#00ff00');
    const expected =
      colorString('akrobatyka:', orange) +
      ' ' +
      'pobieznie' +
      '        ' +
      colorString('[3/10]', orange) +
      '   ' +
      colorString('miecze:', green) +
      ' ' +
      'doskonale' +
      ' ' +
      colorString('[8/10]', green);
    const result = parse(line);
    expect(result).toBe(expected);
    expect(stripAnsiCodes(result)).toBe('akrobatyka: pobieznie        [3/10]   miecze: doskonale [8/10]');
  });
});
