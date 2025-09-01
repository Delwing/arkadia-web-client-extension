import initWorldRebirth from '../src/scripts/worldRebirth';
import Triggers from '../src/Triggers';
import { getItemSync } from '../src/storage';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('world rebirth trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    localStorage.clear();
    client = new FakeClient();
    initWorldRebirth((client as unknown) as any);
    parse = (line: string) =>
      Triggers.prototype.parseMultiline.call(client.Triggers, line, '');
  });

  test('stores parsed timestamp', () => {
    const text = 'Swiat odrodzil sie  : Poniedzialek, 1 I 2020, 12:34:56\nCiemnosc.';
    parse(text);
    const saved = getItemSync('last_world_rebirth')?.['last_world_rebirth'];
    expect(typeof saved).toBe('number');
    const d = new Date(saved);
    expect(d.getFullYear()).toBe(2020);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(34);
    expect(d.getSeconds()).toBe(56);
  });
});
