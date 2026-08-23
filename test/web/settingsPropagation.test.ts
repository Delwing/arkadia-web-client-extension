import { characterStorage } from '@modules/core/storage';
import initShortExits from '@client/scripts/shortExits';
import Triggers from '@client/Triggers';
import { defaultSettings } from '@modules/core/defaultSettings';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { FakeClientBase } from '../client/helpers/fakeClient';

class FakeClient extends FakeClientBase {
  Triggers = new Triggers(({} as unknown) as any);
  println = jest.fn();
  private handlers: Record<string, Array<(ev: any) => void>> = {};
  on(event: string, handler: (payload: any) => void) {
    (this.handlers[event] = this.handlers[event] || []).push(handler);
  }
  dispatch(event: string, detail: any) {
    (this.handlers[event] || []).forEach(h => h(detail));
  }
  addEventListener = this.on;
}

describe('settings propagation to scripts', () => {
  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('');
  });

  test('shortenExits setting affects script', () => {
    characterStorage.setCharacter('Test');
    const client = new FakeClient();
    initShortExits(client as any);
    const parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    const line = 'Sa tutaj dwa widoczne wyjscia: polnoc i wschod.';
    const result1 = parse(line);
    expect(result1?.text).toBe(line);

    characterStorage.onAnyChange((key, newValue) => {
      if (key === 'settings') {
        client.dispatch('settings', newValue);
      }
    });

    characterStorage.set('settings', { ...defaultSettings, shortenExits: true });

    const result2 = parse(line);
    expect(result2?.text).toBe('-----: N E');

    // Check that the result is colored
    const segments = result2?.getSegments() ?? [];
    expect(segments.some(seg => seg.state?.foreground)).toBe(true);
  });
});
