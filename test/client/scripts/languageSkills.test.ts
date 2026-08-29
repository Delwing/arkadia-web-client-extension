import Triggers from '@client/Triggers';
import { EventEmitter } from 'events';
import initLanguageSkills from '@client/scripts/languageSkills';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  send = jest.fn();
  sendCommand = jest.fn();
  contentWidth = 120;
  on(event: string, cb: any) { this.emitter.on(event, cb); }
  off(event: string, cb: any) { this.emitter.off(event, cb); }
}

const TABLE = [
  'khazalid:                 pelna',
  'tileanski:                znikoma',
];
const CARRIAGE = 'Wraz z Wexlinem i dojrzalym malomownym mezczyzna jedziesz duzym dwuosiowym dylizansem na poludniowy-wschod.';

/** Starts the `jezyki` alias and returns the client with its one-shot trigger armed. */
function start() {
  jest.useFakeTimers();
  localStorage.clear();
  const client = new FakeClient();
  const aliases: { pattern: RegExp; callback: () => void }[] = [];
  initLanguageSkills((client as unknown) as any, aliases);
  const run = aliases.find(a => a.pattern.source === '^jezyki$')!.callback as any;
  run();
  return client;
}

describe('jezyki table', () => {
  test('renders a gauge per language', () => {
    const client = start();
    const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(TABLE.join('\n')), '');

    expect(client.send).toHaveBeenCalledWith('jezyki');
    const printed = (out?.text || '').split('\n');
    expect(printed.length).toBe(2);
    expect(printed[0]).toMatch(/khazalid:\s+pelna\s+\[={10}]/);
    expect(printed[1]).toMatch(/tileanski:\s+znikoma\s+\[=\s{9}]/);
  });

  test('a line flushed after the table reaches the screen instead of being restyled', () => {
    const client = start();
    const out = client.Triggers.parseMultiline(
      new AnsiAwareBuffer([...TABLE, CARRIAGE].join('\n')),
      ''
    );

    const printed = (out?.text || '').split('\n');
    expect(printed[printed.length - 1]).toBe(CARRIAGE);
    expect(printed[0]).toMatch(/khazalid:\s+pelna\s+\[={10}]/);
  });

  test('a line flushed before the table reaches the screen too', () => {
    const client = start();
    const out = client.Triggers.parseMultiline(
      new AnsiAwareBuffer([CARRIAGE, ...TABLE].join('\n')),
      ''
    );

    const printed = (out?.text || '').split('\n');
    expect(printed[0]).toBe(CARRIAGE);
    expect(printed[1]).toMatch(/khazalid:\s+pelna\s+\[={10}]/);
  });

  test('a colon-shaped line that is not a language row does not spend the one shot', () => {
    const client = start();
    const chatter = 'Zorlan mowi: czesc';

    const first = client.Triggers.parseMultiline(new AnsiAwareBuffer(chatter), '');
    expect(first?.text).toBe(chatter);

    // The trigger is still armed, so the table that follows is still rendered.
    const out = client.Triggers.parseMultiline(new AnsiAwareBuffer(TABLE.join('\n')), '');
    expect((out?.text || '').split('\n')[0]).toMatch(/khazalid:\s+pelna\s+\[={10}]/);
  });
});

describe('jezyki maksymalne table', () => {
  function startMax() {
    jest.useFakeTimers();
    localStorage.clear();
    const client = new FakeClient();
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initLanguageSkills((client as unknown) as any, aliases);
    const runMax = aliases.find(a => a.pattern.source === '^jezyki maksymalne$')!.callback as any;
    runMax();
    return client;
  }

  test('records the maxima and passes an unrelated line through untouched', () => {
    const client = startMax();
    const out = client.Triggers.parseMultiline(
      new AnsiAwareBuffer([...TABLE, CARRIAGE].join('\n')),
      ''
    );

    expect(client.send).toHaveBeenCalledWith('jezyki maksymalne');
    const printed = (out?.text || '').split('\n');
    expect(printed[printed.length - 1]).toBe(CARRIAGE);
    expect(printed.slice(0, 2)).toEqual(TABLE);
  });
});
