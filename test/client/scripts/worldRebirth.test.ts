import initWorldRebirth from '@client/scripts/worldRebirth';
import Triggers from '@client/Triggers';
import { getItemSync } from '@modules/core/storage';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  events: { type: string; payload: any }[] = [];
  sendEvent(type: string, payload: any) {
    this.events.push({ type, payload });
  }
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
    expect(client.events).toHaveLength(1);
    expect(client.events[0].type).toBe('systemRebirth');
    expect(client.events[0].payload).toBe(saved);
    const d = new Date(saved * 1000);
    expect(d.getFullYear()).toBe(2020);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(34);
    expect(d.getSeconds()).toBe(56);
  });
});
