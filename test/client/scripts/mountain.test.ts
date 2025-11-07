import initMountain from '@client/scripts/mountain';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  Map = { moveBack: jest.fn() };
}

describe('mountain triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initMountain((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('colors descending line yellow', () => {
    const result = parse('Zaczynasz schodzic na dol.');
    expect(result?.text).toBe('Zaczynasz schodzic na dol.');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
  });

  test('colors climbing line yellow', () => {
    const result = parse('Zaczynasz wspinac sie');
    expect(result?.text).toBe('Zaczynasz wspinac sie');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
  });

  test('colors reaching top line yellow', () => {
    const result = parse('Docierasz na gore.');
    expect(result?.text).toBe('Docierasz na gore.');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
  });

  test('colors safe descent line yellow', () => {
    const result = parse('Bezpiecznie schodzisz na dol.');
    expect(result?.text).toBe('Bezpiecznie schodzisz na dol.');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
  });

  test('colors falling line yellow and moves back when climbing up', () => {
    parse('Zaczynasz wspinac sie');
    const result = parse('Odpadasz od sciany i lecisz w dol');
    expect(result?.text).toBe('Odpadasz od sciany i lecisz w dol');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
    expect(client.Map.moveBack).toHaveBeenCalled();
  });
});
