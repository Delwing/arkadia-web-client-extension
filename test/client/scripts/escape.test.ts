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

  test('ignores movement of someone other than the escapee', () => {
    parse('Baz uciekl ci.');
    const result = parse('[1] Evandeil podaza na polnocny-zachod.');
    expect(result?.text).toBe('[1] Evandeil podaza na polnocny-zachod.');
    expect(client.print).not.toHaveBeenCalled();
  });

  test('ignores panic escape of someone other than the escapee', () => {
    parse('Baz uciekl ci.');
    parse('Evandeil w panice ucieka na polnoc.');
    expect(client.print).not.toHaveBeenCalled();
  });

  test('draws arrow for the escapee even when the line is prefixed', () => {
    parse('Baz uciekl ci.');
    parse('[1] Baz podaza na wschod.');
    expect(client.print).toHaveBeenCalled();
  });

  test('draws arrow for a descriptive escapee name', () => {
    parse('Zlotowlosy zwinny elfi tancerz wojny uciekl ci.');
    parse('Zlotowlosy zwinny elfi tancerz wojny podaza na poludnie.');
    expect(client.print).toHaveBeenCalled();
  });

  test('draws arrow when the elfka runs off laughing', () => {
    parse('Kolorowowlosa rozesmiana elfka wybiega smiejac sie na caly glos na wschod.');
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

  test('draws arrow when the elfka runs off giggling', () => {
    parse('Kolorowowlosa rozesmiana elfka wybiega chichoczac na polnoc.');
    expect(client.print).toHaveBeenCalled();
  });

  test('highlights escape success line', () => {
    const result = parse('Udalo ci sie gdzies uciec!');
    expect(result?.text).toContain('Udalo ci sie gdzies uciec!');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });
});
