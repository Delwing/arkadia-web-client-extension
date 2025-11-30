import initPersonDescription from '@client/scripts/personDescription';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  sendEvent = jest.fn();
}

describe('person description trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initPersonDescription((client as unknown) as any);
    parse = (line: string) =>
      Triggers.prototype.parseMultiline.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('colors and bolds description for "Jestes" with "znanym jako"', () => {
    const text = 'Jestes zezowatym barylkowatym krasnoludem, znanym jako:\nDelwing z Twierdzy Karak Kadrin, Wloczykij, krasnolud.';
    const result = parse(text);

    expect(result).not.toBeNull();
    const segments = result!.getSegments();

    // Find the description segment
    const descSegment = segments.find(seg => seg.text.includes('zezowatym barylkowatym krasnoludem'));
    expect(descSegment).toBeDefined();
    expect(descSegment?.state?.bold).toBe(true);
    expect(descSegment?.state?.foreground).toEqual({ space: 'hex', color: '#ffcc99' });

    // Find the name segment (first word after newline)
    const nameSegment = segments.find(seg => seg.text === 'Delwing');
    expect(nameSegment).toBeDefined();
    expect(nameSegment?.state?.bold).toBe(true);
  });

  test('colors and bolds description for "Jest" with "znanym jako"', () => {
    const text = 'Jest niskim przysadzistym krasnoludem, znanym jako:\nGimli syn Gloina.';
    const result = parse(text);

    expect(result).not.toBeNull();
    const segments = result!.getSegments();

    // Find the description segment
    const descSegment = segments.find(seg => seg.text.includes('niskim przysadzistym krasnoludem'));
    expect(descSegment).toBeDefined();
    expect(descSegment?.state?.bold).toBe(true);
    expect(descSegment?.state?.foreground).toEqual({ space: 'hex', color: '#ffcc99' });

    // Find the name segment
    const nameSegment = segments.find(seg => seg.text === 'Gimli');
    expect(nameSegment).toBeDefined();
    expect(nameSegment?.state?.bold).toBe(true);
  });

  test('colors and bolds description for "Jest" with "znana jako" (female)', () => {
    const text = 'Jest wysoka smukla kobieta, znana jako:\nArwen Undomiel.';
    const result = parse(text);

    expect(result).not.toBeNull();
    const segments = result!.getSegments();

    // Find the description segment
    const descSegment = segments.find(seg => seg.text.includes('wysoka smukla kobieta'));
    expect(descSegment).toBeDefined();
    expect(descSegment?.state?.bold).toBe(true);

    // Find the name segment
    const nameSegment = segments.find(seg => seg.text === 'Arwen');
    expect(nameSegment).toBeDefined();
    expect(nameSegment?.state?.bold).toBe(true);
  });

  test('does not match text without proper format', () => {
    const text = 'To jest zwykly tekst bez formatu.';
    const result = parse(text);

    expect(result).not.toBeNull();
    const segments = result!.getSegments();

    // No segment should have bold
    const boldSegment = segments.find(seg => seg.state?.bold === true);
    expect(boldSegment).toBeUndefined();
  });

  test('does not match single line without newline', () => {
    const text = 'Jestes zezowatym krasnoludem, znanym jako: Delwing.';
    const result = parse(text);

    expect(result).not.toBeNull();
    const segments = result!.getSegments();

    // No segment should have bold (pattern requires newline)
    const boldSegment = segments.find(seg => seg.state?.bold === true);
    expect(boldSegment).toBeUndefined();
  });
});
