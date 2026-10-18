import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { LineTraceEntry, LineTraceRecorder } from '@client/lineTrace';

function setup() {
  const entries: LineTraceEntry[] = [];
  const triggers = new Triggers({} as any);
  triggers.trace = new LineTraceRecorder(entry => entries.push(entry));
  // What Client.processLine does around the two passes.
  const run = (text: string, type = '') => {
    const buffer = new AnsiAwareBuffer(text);
    triggers.trace!.begin(buffer, type);
    let result = triggers.parseMultiline(buffer, type);
    if (result) result = triggers.parseLine(result, type);
    triggers.trace!.end(result);
    return entries[entries.length - 1];
  };
  return { triggers, entries, run };
}

describe('LineTraceRecorder', () => {
  test('keeps the raw line next to what triggers made of it', () => {
    const { triggers, run } = setup();
    triggers.registerTrigger(/^foo/, (line) => line.replace([0, 3], 'bar'), 'renamer');

    const entry = run('foo baz', 'other');

    expect(entry.raw).toBe('foo baz');
    expect(entry.final).toBe('bar baz');
    expect(entry.type).toBe('other');
    expect(entry.steps).toHaveLength(1);
    expect(entry.steps[0]).toMatchObject({ tag: 'renamer', pass: 'line', outcome: 'changed', child: false });
    expect(entry.steps[0].trigger).toBe('renamer (^foo)');
    expect(entry.steps[0].beforeHtml).toBe('foo baz');
    expect(entry.steps[0].afterHtml).toBe('bar baz');
  });

  test('the raw line drops the line ending the output never shows', () => {
    const { run } = setup();

    const entry = run('\x1b[31mred\x1b[0m\r\n');

    expect(entry.raw).toBe('red');
    expect(entry.rawHtml).not.toContain('\n');
  });

  test('records a trigger that matched but left the line alone', () => {
    const { triggers, run } = setup();
    triggers.registerTrigger(/quiet/, () => undefined as any);
    triggers.registerTrigger(/nomatch/, () => undefined as any);

    const entry = run('a quiet line');

    expect(entry.final).toBe('a quiet line');
    expect(entry.steps.map(s => s.outcome)).toEqual(['kept']);
  });

  test('a recolor counts as a change even though the text is the same', () => {
    const { triggers, run } = setup();
    triggers.registerTrigger(/red/, (line) => line.color([0, 3], 1));

    const entry = run('red line');

    expect(entry.final).toBe('red line');
    expect(entry.steps[0].outcome).toBe('changed');
  });

  test('a gag leaves final null and names the trigger that removed the line', () => {
    const { triggers, run } = setup();
    triggers.registerTrigger(/spam/, () => null, 'gag');
    triggers.registerTrigger(/spam/, (line) => line.markAsDeleted(), 'gag2');

    const entry = run('spam spam');

    expect(entry.final).toBeNull();
    expect(entry.finalHtml).toBeNull();
    // The first gag returns null and ends the pass; the second never runs.
    expect(entry.steps).toHaveLength(1);
    expect(entry.steps[0]).toMatchObject({ tag: 'gag', outcome: 'deleted' });
  });

  test('marks children, gating parents, multiline and token passes', () => {
    const { triggers, run } = setup();
    const parent = triggers.registerTrigger(/^Ktos/, undefined, 'parent');
    parent.registerChild(/mowi/, (line) => line, 'child');
    triggers.registerMultilineTrigger(/Ktos/, (line) => line, 'multi');
    triggers.registerTokenTrigger('mowi', (line) => line, 'token');

    const entry = run('Ktos mowi cos');

    expect(entry.steps.map(s => [s.tag, s.pass, s.child])).toEqual([
      ['multi', 'multiline', false],
      ['parent', 'line', false],
      ['child', 'line', true],
      ['token', 'token', false],
    ]);
  });

  test('a throwing callback is still recorded and the line goes on', () => {
    const { triggers, run } = setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    triggers.registerTrigger(/boom/, () => { throw new Error('x'); }, 'broken');

    const entry = run('boom');

    expect(entry.final).toBe('boom');
    expect(entry.steps[0]).toMatchObject({ tag: 'broken', outcome: 'kept' });
    error.mockRestore();
  });

  test('a line printed from inside a callback gets its own entry', () => {
    const { triggers, entries, run } = setup();
    triggers.registerTrigger(/outer/, (line) => {
      run('inner');
      return line;
    }, 'outer');
    triggers.registerTrigger(/inner/, (line) => line, 'inner');

    run('outer');

    expect(entries.map(e => e.raw)).toEqual(['inner', 'outer']);
    expect(entries[0].steps.map(s => s.tag)).toEqual(['inner']);
    expect(entries[1].steps.map(s => s.tag)).toEqual(['outer']);
  });

  test('without a recorder nothing is traced', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn((line: AnsiAwareBuffer) => line);
    triggers.registerTrigger(/x/, cb);

    expect(triggers.parseLine(new AnsiAwareBuffer('x'), '')?.text).toBe('x');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(triggers.trace).toBeNull();
  });
});
