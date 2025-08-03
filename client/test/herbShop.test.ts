import initHerbShop from '../src/scripts/herbShop';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  contentWidth = 40;

  addEventListener(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  removeEventListener(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  dispatch(event: string, detail: any) {
    this.emitter.emit(event, { detail });
  }
}

describe('herb shop width adjustments', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initHerbShop((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  const split = '+----------------------------------------------------------+----+----+----+----+-------+';
  const header = '| Nazwa towaru                                             | mt | zl | sr | md | Ilosc |';
  const item = '| rozgaleziona wzniesiona lodyga (jaskier)                 |  0 |  0 |  6 |  2 |   100 |';

  test('adjusts split line', () => {
    const result = parse(split);
    expect(result).toBe('+'.padEnd(client.contentWidth - 1, '-') + '+');
  });

  test('splits header and item lines when narrow', () => {
    const h = parse(header).split('\n');
    expect(h[0]).toMatch(/Nazwa towaru/);
    expect(h[1]).toMatch(/mt/);

    const it = parse(item).split('\n');
    expect(it[0]).toMatch(/\|\s*100\|/);
    expect(it[0]).toMatch(/jaskier/);
    expect(it[1]).toMatch(/\//);
  });

  test('keeps item on one line when there is room', () => {
    client.contentWidth = 70;
    client.dispatch('contentWidth', 70);
    const result = parse(item);
    expect(result).not.toMatch(/\n/);
    const stripped = stripAnsiCodes(result);
    expect(stripped).toMatch(/^\|\s*100\|/);
    expect(stripped).toMatch(/0\/0\/6\/2\s*\|$/);
  });

  test('leaves lines unchanged when wide enough', () => {
    client.contentWidth = 90;
    client.dispatch('contentWidth', 90);
    expect(parse(header)).toBe(header);
    expect(parse(item)).toBe(item);
  });
});
