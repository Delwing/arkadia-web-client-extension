import initArmorShop from '@client/scripts/armorShop';
import Triggers, { stripAnsiCodes } from '@client/Triggers';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  contentWidth = 40;

  on(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  off(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  dispatch(event: string, detail: any) {
    this.emitter.emit(event, detail);
  }
}

describe('armor shop width adjustments', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initArmorShop((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  const split = '---------------------------------------------------------------------------';
  const header = '|               Nazwa towaru              |Mithryl| Zloto | Srebro| Miedz |';
  const item = '| Stara rycerska para naudziakow          |       |   2   |   7   |   6   |';

  test('adjusts split line', () => {
    const result = parse(split);
    expect(result).toBe('-'.repeat(client.contentWidth));
  });

  test('splits item line when narrow', () => {
    const h = parse(header);
    expect(h).toMatch(/Nazwa towaru/);
    expect(h).not.toMatch(/\n/);

    const it = parse(item).split('\n');
    expect(it[0]).toMatch(/rycerska/);
    expect(it[1]).toMatch(/\//);
  });

  test('keeps item on one line when there is room', () => {
    client.contentWidth = 50;
    client.dispatch('contentWidth', 50);
    const result = parse(item);
    expect(result).not.toMatch(/\n/);
    expect(stripAnsiCodes(result)).toMatch(/0\/2\/7\/6/);
  });

  test('leaves lines unchanged when wide enough', () => {
    client.contentWidth = 80;
    client.dispatch('contentWidth', 80);
    expect(parse(header)).toBe(header);
    expect(parse(item)).toBe(item);
  });
});
