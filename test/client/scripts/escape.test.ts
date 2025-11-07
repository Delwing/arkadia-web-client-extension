import initEscape from '@client/scripts/escape';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  print = jest.fn();
  prefix = (line: string, prefix: string) => prefix + line;
}

describe('escape triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initEscape((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('highlights escape line', () => {
    const result = parse('Baz uciekl ci.');
    expect(result?.text).toBe('Baz uciekl ci.');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('highlights follow line with arrow', () => {
    parse('Baz uciekl ci.');
    const result = parse('Baz podaza na wschod.');
    expect(result?.text).toBe('Baz podaza na wschod.');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
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
    expect(result?.text).toBe('Baz w panice ucieka na polnoc.');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
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
    expect(result?.text).toContain('Udalo ci sie gdzies uciec!');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });
});
