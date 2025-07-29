import initNoWeaponAlert from '../src/scripts/noWeaponAlert';
import Triggers from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  playSound = jest.fn();
  println = jest.fn();
}

describe('no weapon alert', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new FakeClient();
    initNoWeaponAlert((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('beeps and prints on match', () => {
    parse('Probujesz trafic Orka lewym piescia');
    expect(client.playSound).toHaveBeenCalledTimes(1);
    expect(client.println).toHaveBeenCalledTimes(1);
  });

  test('throttles alerts', () => {
    parse('Probujesz trafic Orka lewym piescia');
    jest.advanceTimersByTime(1000);
    parse('Ledwo muskasz Orka prawym kolanem');
    expect(client.playSound).toHaveBeenCalledTimes(1);
    expect(client.println).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    parse('Lekko ranisz Orka lewym stopa');
    expect(client.playSound).toHaveBeenCalledTimes(2);
    expect(client.println).toHaveBeenCalledTimes(2);
  });
});
