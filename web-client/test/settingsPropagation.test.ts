import storage from '@client/src/storage';
import initShortExits from '@client/src/scripts/shortExits';
import Triggers from '@client/src/Triggers';
import { colorString, findClosestColor } from '@client/src/Colors';
import { defaultSettings } from '@client/src/defaultSettings';

const ORANGE = findClosestColor('#ffa500');

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  println = jest.fn();
  private handlers: Record<string, Array<(ev: any) => void>> = {};
  addEventListener(event: string, handler: (ev: any) => void) {
    (this.handlers[event] = this.handlers[event] || []).push(handler);
  }
  dispatch(event: string, detail: any) {
    (this.handlers[event] || []).forEach(h => h({ detail }));
  }
}

describe('settings propagation to scripts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('shortenExits setting affects script', async () => {
    const client = new FakeClient();
    initShortExits(client as any);
    const parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    const line = 'Sa tutaj dwa widoczne wyjscia: polnoc i wschod.';
    expect(parse(line)).toBe(line);

    storage.onChanged?.addListener(changes => {
      if (changes.settings) {
        client.dispatch('settings', changes.settings.newValue);
      }
    });

    await storage.setItem('settings', { ...defaultSettings, shortenExits: true });
    await new Promise(res => setTimeout(res, 0));

    expect(parse(line)).toBe(colorString('-----: N E', ORANGE));
  });
});
