import Triggers, { stripAnsiCodes } from '@client/Triggers';
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
      const printed = stripAnsiCodes(processed?.text || '').split('\n');
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

      const printed = stripAnsiCodes(processed?.text || '').split('\n');
      expect(printed.length).toBe(5);
      printed.forEach((l) => expect(l.length).toBeLessThanOrEqual(40));
    });
  });
