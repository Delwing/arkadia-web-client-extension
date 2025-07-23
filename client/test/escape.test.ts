import initEscape from '../src/scripts/escape';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { findClosestColor } from '../src/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  print = jest.fn();
  prefix = (line: string, prefix: string) => prefix + line;
}

describe('escape triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  const color = findClosestColor('#6a5acd');
  const prefix = `\x1B[22;38;5;${color}m`;
  const panicColor = findClosestColor('#ff8c00');
  const panicPrefix = `\x1B[22;38;5;${panicColor}m`;
  const successColor = findClosestColor('#ff0000');
  const successPrefix = `\x1B[22;38;5;${successColor}m`;
  const orange = findClosestColor('#ffa500');
  const orangePrefix = `\x1B[22;38;5;${orange}m`;
  const suffix = '\x1B[0m';

  beforeEach(() => {
    client = new FakeClient();
    initEscape((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('highlights escape line', () => {
    const result = parse('Baz uciekl ci.');
    expect(result).toBe(prefix + 'Baz uciekl ci.' + suffix);
  });

  test('highlights follow line with arrow', () => {
    parse('Baz uciekl ci.');
    const result = parse('Baz podaza na wschod.');
    expect(stripAnsiCodes(result)).toBe('Baz podaza na wschod.');
    expect(result.startsWith(prefix)).toBe(true);
    expect(result.endsWith(suffix)).toBe(true);
    const printed = client.print.mock.calls.map(c => stripAnsiCodes(c[0]));
    expect(printed).toEqual([
      '\n',
      '                  #',
      '                   #',
      '              #######',
      '                   #',
      '                  #',
      '\n'
    ]);
  });

  test('highlights panic line with arrow', () => {
    parse('Baz uciekl ci.');
    const result = parse('Baz w panice ucieka na polnoc.');
    expect(stripAnsiCodes(result)).toBe('Baz w panice ucieka na polnoc.');
    expect(result.startsWith(panicPrefix)).toBe(true);
    expect(result.endsWith(suffix)).toBe(true);
    const printed = client.print.mock.calls.map(c => stripAnsiCodes(c[0]));
    expect(printed).toEqual([
      '\n',
      '                  #',
      '                 ###',
      '                # # #',
      '                  #',
      '                  #',
      '\n'
    ]);
  });

  test('highlights escape success line', () => {
    const result = parse('Udalo ci sie gdzies uciec!');
    const expected =
      orangePrefix + '--- ' + suffix + successPrefix + 'Udalo ci sie gdzies uciec!' + suffix;
    expect(result).toBe(expected);
  });
});
