import initCarriage from '../src/scripts/carriage';
import Triggers from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  carriageMode = false;
  moveModeButton = document.createElement('input');
}

describe('carriage mode triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initCarriage((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('turns carriage mode on and off', () => {
    parse('Siadasz w malej bryczce.');
    expect(client.carriageMode).toBe(true);
    expect(client.moveModeButton.disabled).toBe(true);
    parse('Zsiadasz z malej bryczki.');
    expect(client.carriageMode).toBe(false);
    expect(client.moveModeButton.disabled).toBe(false);
  });
});
