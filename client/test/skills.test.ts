import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { EventEmitter } from 'events';
import initSkills from '../src/scripts/skills';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  sendCommand = jest.fn();
  println = jest.fn();
  contentWidth = 120;
  addEventListener(event: string, cb: any) { this.emitter.on(event, cb); }
  removeEventListener(event: string, cb: any) { this.emitter.off(event, cb); }
  dispatch(event: string, detail: any) { this.emitter.emit(event, { detail }); }
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
    const parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');

    run();
    parse(LINE1);
    parse(LINE2);
    parse(LINE3);
    jest.advanceTimersByTime(1000);

    expect(client.sendCommand).toHaveBeenCalledWith('um');
    const printed = stripAnsiCodes(client.println.mock.calls[0][0]).split('\n');
    expect(printed.length).toBe(3);
  });

  test('splits columns when width is small', () => {
    jest.useFakeTimers();
    const client = new FakeClient();
    client.contentWidth = 40;
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initSkills((client as unknown) as any, aliases);
    const run = aliases[0].callback as any;
    const parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');

    run();
    parse(LINE1);
    parse(LINE2);
    parse(LINE3);
    jest.advanceTimersByTime(1000);

    const printed = stripAnsiCodes(client.println.mock.calls[0][0]).split('\n');
    expect(printed.length).toBe(5);
    printed.forEach((l) => expect(l.length).toBeLessThanOrEqual(40));
  });
});
