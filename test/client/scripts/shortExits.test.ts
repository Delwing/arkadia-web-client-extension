import initShortExits, { parseExitString, toShort } from '@client/scripts/shortExits';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';
import { FakeClientBase } from '../helpers/fakeClient';

class FakeClient extends FakeClientBase {
  Triggers = new Triggers(({} as unknown) as any);
  println = jest.fn();
}

describe('short exits trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initShortExits(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    setTestSettings({ shortenExits: true });
    jest.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('parseExitString splits directions', () => {
    expect(parseExitString('polnoc, poludnie i wschod')).toEqual(['polnoc', 'poludnie', 'wschod']);
  });

  test('toShort converts directions', () => {
    expect(toShort('polnoc')).toBe('n');
    expect(toShort('south')).toBe('s');
    expect(toShort('north')).toBe('n');
    expect(toShort('unknown')).toBe('unknown');
  });

  test('replaces exit line', () => {
    const result = parse('Sa tutaj dwa widoczne wyjscia: polnoc i wschod.');
    expect(result?.text).toBe('-----: N E');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
    expect(client.println).not.toHaveBeenCalled();
  });

  test('includes unknown directions in output', () => {
    const result = parse('Sa tutaj dwa widoczne wyjscia: polnoc i foo.');
    expect(result?.text).toBe('-----: N FOO');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
    expect(client.println).not.toHaveBeenCalled();
  });
});
