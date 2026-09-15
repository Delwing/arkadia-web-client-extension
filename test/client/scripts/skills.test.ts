import Triggers from '@client/Triggers';
import { EventEmitter } from 'events';
import initSkills from '@client/scripts/skills';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  send = jest.fn();
  sendCommand = jest.fn();
  contentWidth = 120;
  on(event: string, cb: any) { this.emitter.on(event, cb); }
  off(event: string, cb: any) { this.emitter.off(event, cb); }
  dispatch(event: string, detail: any) { this.emitter.emit(event, detail); }
}

const LINE1 = 'akrobatyka:             troche           alchemia:               troche';
const LINE2 = 'gornictwo:              ledwo            lowiectwo:              pobieznie';
const LINE3 = 'zielarstwo:             troche';

describe('skills alias', () => {
    test('formats skills in columns', () => {
      jest.useFakeTimers();
      const client = new FakeClient();
      const aliases: { pattern: RegExp; callback: () => void }[] = [];
      initSkills((client as unknown) as any, aliases);
      const run = aliases[0].callback as any;

      run();
      const raw = `${LINE1}\n${LINE2}\n${LINE3}`;
      const processed = client.Triggers.parseMultiline(new AnsiAwareBuffer(raw), '');
      expect(client.send).toHaveBeenCalledWith('um');
      expect(client.sendCommand).not.toHaveBeenCalled();
      const printed = (processed?.text || '').split('\n');
      expect(printed.length).toBe(3);
      expect(printed[0]).toMatch(/akrobatyka:\s+troche\s+\[2\/10]\s+alchemia:\s+troche\s+\[2\/10]/);
      expect(printed[1]).toMatch(/gornictwo:\s+ledwo\s+\[1\/10]\s+lowiectwo:\s+pobieznie\s+\[3\/10]/);
      expect(printed[2]).toMatch(/zielarstwo:\s+troche\s+\[2\/10]/);
    });

    test('splits columns when width is small', () => {
      jest.useFakeTimers();
      const client = new FakeClient();
      client.contentWidth = 40;
      const aliases: { pattern: RegExp; callback: () => void }[] = [];
      initSkills((client as unknown) as any, aliases);
      const run = aliases[0].callback as any;

      run();
      const raw = `${LINE1}\n${LINE2}\n${LINE3}`;
      const processed = client.Triggers.parseMultiline(new AnsiAwareBuffer(raw), '');

      const printed = (processed?.text || '').split('\n');
      expect(printed.length).toBe(5);
      printed.forEach((l) => expect(l.length).toBeLessThanOrEqual(40));
    });
  });

describe('skill modifiers', () => {
    function start(contentWidth = 120) {
      jest.useFakeTimers();
      const client = new FakeClient();
      client.contentWidth = contentWidth;
      const aliases: { pattern: RegExp; callback: () => void }[] = [];
      initSkills((client as unknown) as any, aliases);
      (aliases[0].callback as any)();
      return client;
    }

    test('a modifier is shown next to the skill it belongs to', () => {
      const client = start();
      const raw = [
        'skradanie sie:          ledwo           ( -teren )',
        'zielarstwo:             troche',
      ].join('\n');
      const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(raw), '');

      const printed = (out?.text || '').split('\n');
      expect(printed.length).toBe(1);
      expect(printed[0]).toMatch(
        /skradanie sie:\s+ledwo\s+\[1\/10]\s+\(-teren\)\s+zielarstwo:\s+troche\s+\[2\/10]/
      );
      expect(printed[0]).not.toMatch(/\s$/);
    });

    test("a modifier is not swallowed into the next column's skill name", () => {
      const client = start();
      const raw =
        'skradanie sie:          ledwo           ( -teren )    ukrywanie sie:          ledwo           ( -teren )';
      const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(raw), '');

      const printed = (out?.text || '').split('\n');
      expect(printed.length).toBe(1);
      expect(printed[0]).toMatch(
        /^skradanie sie:\s+ledwo\s+\[1\/10]\s+\(-teren\)\s+ukrywanie sie:\s+ledwo\s+\[1\/10]\s+\(-teren\)$/
      );
    });

    test('several modifiers on one skill all survive', () => {
      const client = start();
      const raw = 'skradanie sie:          ledwo           ( -teren ) ( +noc )';
      const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(raw), '');

      expect(out?.text).toMatch(/skradanie sie:\s+ledwo\s+\[1\/10]\s+\(-teren\) \(\+noc\)$/);
    });

    test('unmodified skills stay aligned with modified ones', () => {
      const client = start();
      const raw = [
        'skradanie sie:          ledwo           ( -teren )',
        'ukrywanie sie:          ledwo',
        'zielarstwo:             troche',
        'palenie:                ledwo',
      ].join('\n');
      const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(raw), '');

      const printed = (out?.text || '').split('\n');
      expect(printed.length).toBe(2);
      // The modifier field is reserved on every row, so the second column starts in the
      // same place whether or not the first column carried a modifier.
      expect(printed[0].indexOf('ukrywanie sie:')).toBe(printed[1].indexOf('palenie:'));
    });

    test('a narrow screen still splits the columns onto separate lines', () => {
      const client = start(40);
      const raw = [
        'skradanie sie:          ledwo           ( -teren )',
        'ukrywanie sie:          ledwo           ( -teren )',
      ].join('\n');
      const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(raw), '');

      const printed = (out?.text || '').split('\n');
      expect(printed.length).toBe(2);
      printed.forEach((l) => {
        expect(l.length).toBeLessThanOrEqual(40);
        expect(l).toMatch(/\(-teren\)$/);
      });
    });
});

describe('um table sharing a frame with unrelated output', () => {
    const TABLE = [
      'akrobatyka:             troche',
      'gornictwo:              ledwo',
      'zielarstwo:             troche',
    ];
    const CARRIAGE = 'Wraz z Wexlinem i dojrzalym malomownym mezczyzna jedziesz duzym dwuosiowym dylizansem na poludniowy-wschod.';

    function start() {
      jest.useFakeTimers();
      const client = new FakeClient();
      const aliases: { pattern: RegExp; callback: () => void }[] = [];
      initSkills((client as unknown) as any, aliases);
      (aliases[0].callback as any)();
      return client;
    }

    test('a line flushed after the table reaches the screen instead of being dropped', () => {
      const client = start();
      const raw = [...TABLE, CARRIAGE].join('\n');
      const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(raw), '');

      const printed = (out?.text || '').split('\n');
      expect(printed[printed.length - 1]).toBe(CARRIAGE);
      expect(printed[0]).toMatch(/akrobatyka:\s+troche\s+\[2\/10]/);
    });

    test('a line flushed before the table reaches the screen too', () => {
      const client = start();
      const raw = [CARRIAGE, ...TABLE].join('\n');
      const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(raw), '');

      const printed = (out?.text || '').split('\n');
      expect(printed[0]).toBe(CARRIAGE);
      expect(printed[1]).toMatch(/akrobatyka:\s+troche\s+\[2\/10]/);
    });

    test('a colon-shaped line that is not a skill row does not spend the one shot', () => {
      const client = start();
      const chatter = 'Zorlan mowi: czesc';

      const first = client.Triggers.parseMultiline(new AnsiAwareBuffer(chatter), '');
      expect(first?.text).toBe(chatter);

      // The trigger is still armed, so the table that follows is still formatted.
      const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(TABLE.join('\n')), '');
      expect((out?.text || '').split('\n')[0]).toMatch(/akrobatyka:\s+troche\s+\[2\/10]/);
    });
});
