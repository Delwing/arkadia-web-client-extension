import initSpellEffects, { type SpellEffect } from '@client/scripts/spellEffects';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

const waning = (spell: string, phrase: string) =>
  `Czujesz, ze efekt dzialania czaru '${spell}' powoli slabnie, ale powinien sie jeszcze utrzymac przez ${phrase} czas.`;
const ended = (spell: string) =>
  `Czujesz, ze efekt dzialania czaru '${spell}' konczy sie, a twoj wyglad powraca do normy.`;

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  private handlers: Record<string, ((...args: any[]) => void)[]> = {};
  sendEvent = jest.fn();
  now = () => Date.now();
  on(event: string, cb: (...args: any[]) => void) {
    (this.handlers[event] ??= []).push(cb);
  }
  fire(event: string) {
    this.handlers[event]?.forEach(cb => cb());
  }
}

describe('spell effect countdowns', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  const latest = (): SpellEffect[] | undefined => {
    const calls = (client.sendEvent as jest.Mock).mock.calls.filter(([event]) => event === 'spellEffects');
    return calls.at(-1)?.[1];
  };

  beforeEach(() => {
    jest.useFakeTimers();
    client = new FakeClient();
    initSpellEffects((client as unknown) as any);
    parse = line => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('starts a countdown from the time a warning names', () => {
    parse(waning('przeobrazenie', 'dlugi'));
    expect(latest()).toEqual([{ name: 'przeobrazenie', seconds: 480 }]);

    jest.advanceTimersByTime(10_000);
    expect(latest()).toEqual([{ name: 'przeobrazenie', seconds: 470 }]);
  });

  test('re-syncs on every later warning', () => {
    parse(waning('przeobrazenie', 'dlugi'));
    jest.advanceTimersByTime(200_000);
    parse(waning('przeobrazenie', 'dosc dlugi'));
    expect(latest()).toEqual([{ name: 'przeobrazenie', seconds: 240 }]);

    parse(waning('przeobrazenie', 'bardzo krotki'));
    expect(latest()).toEqual([{ name: 'przeobrazenie', seconds: 10 }]);
  });

  test('takes the countdown down when the spell ends', () => {
    parse(waning('przeobrazenie', 'krotki'));
    parse(ended('przeobrazenie'));
    expect(latest()).toEqual([]);
  });

  test('tracks several spells at once, soonest first', () => {
    parse(waning('przeobrazenie', 'pewien'));
    parse(waning('kamienna skora', 'dosc krotki'));
    expect(latest()).toEqual([
      { name: 'kamienna skora', seconds: 60 },
      { name: 'przeobrazenie', seconds: 120 },
    ]);

    parse(ended('kamienna skora'));
    expect(latest()).toEqual([{ name: 'przeobrazenie', seconds: 120 }]);
  });

  test('holds at zero for the end line, then gives up on it', () => {
    parse(waning('przeobrazenie', 'bardzo krotki'));
    jest.advanceTimersByTime(15_000);
    expect(latest()).toEqual([{ name: 'przeobrazenie', seconds: 0 }]);

    jest.advanceTimersByTime(60_000);
    expect(latest()).toEqual([]);
  });

  test('marks both lines with the spell prefix', () => {
    expect(parse(waning('przeobrazenie', 'dlugi'))?.text).toBe('[ CZAR ] ' + waning('przeobrazenie', 'dlugi'));
    expect(parse(ended('przeobrazenie'))?.text).toBe('[ CZAR ] ' + ended('przeobrazenie'));
  });

  test('ignores a phrase it does not know', () => {
    parse(waning('przeobrazenie', 'nieokreslony'));
    expect(latest()).toBeUndefined();
  });

  test('clears everything on a new life', () => {
    parse(waning('przeobrazenie', 'dlugi'));
    client.fire('reset');
    expect(latest()).toEqual([]);
  });
});
