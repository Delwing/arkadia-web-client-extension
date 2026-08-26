import initCarriage from '@client/scripts/carriage';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  aliases: { pattern: RegExp; callback: Function }[] = [];
  carriageMode = false;
  moveModeButton = document.createElement('input');
  println = jest.fn();
  sendEvent = jest.fn();
}

describe('carriage mode triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initCarriage((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('turns carriage mode on and off', () => {
    parse('Siadasz w malej bryczce.');
    expect(client.carriageMode).toBe(true);
    expect(client.moveModeButton.disabled).toBe(true);
    parse('Zsiadasz z malej bryczki.');
    expect(client.carriageMode).toBe(false);
    expect(client.moveModeButton.disabled).toBe(false);
  });

  test('turns carriage mode on when boarding "na" a carriage', () => {
    parse('Siadasz na solidnym krytym wozie.');
    expect(client.carriageMode).toBe(true);
    expect(client.moveModeButton.disabled).toBe(true);
  });

  test('turns carriage mode off when returning a carriage', () => {
    client.carriageMode = true;
    client.moveModeButton.disabled = true;
    parse('Zwracasz elegancka odkryta bryczke w terminie odzyskujac calosc kaucji rowna jednej mithrylowej monecie.');
    expect(client.carriageMode).toBe(false);
    expect(client.moveModeButton.disabled).toBe(false);
  });

  test('announces carriage mode changes', () => {
    parse('Siadasz w malej bryczce.');
    expect(client.sendEvent).toHaveBeenCalledWith('carriageModeChanged', true);
    parse('Zsiadasz z malej bryczki.');
    expect(client.sendEvent).toHaveBeenCalledWith('carriageModeChanged', false);
  });

  test('/woz alias toggles carriage mode', () => {
    const woz = client.aliases.find((a) => a.pattern.test('/woz'));
    expect(woz).toBeDefined();
    woz!.callback([]);
    expect(client.carriageMode).toBe(true);
    expect(client.moveModeButton.disabled).toBe(true);
    woz!.callback([]);
    expect(client.carriageMode).toBe(false);
    expect(client.moveModeButton.disabled).toBe(false);
  });
});
