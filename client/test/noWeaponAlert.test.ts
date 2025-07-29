import initNoWeaponAlert from '../src/scripts/noWeaponAlert';
import Triggers from '../src/Triggers';
import { colorString, findClosestColor } from '../src/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  playSound = jest.fn();
  println = jest.fn();
}

describe('no weapon alert', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  const color = findClosestColor('#ff0000');

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

  test('prints colored message on match', () => {
    parse('Probujesz trafic Orka lewym piescia');
    expect(client.playSound).not.toHaveBeenCalled();
    const expected = colorString(' >> Walczysz bez broni!', color);
    expect(client.println).toHaveBeenCalledWith(expected);
  });

  test('throttles alerts', () => {
    parse('Probujesz trafic Orka lewym piescia');
    jest.advanceTimersByTime(1000);
    parse('Ledwo muskasz Orka prawym kolanem');
    expect(client.playSound).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    parse('Lekko ranisz Orka lewym stopa');
    expect(client.playSound).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledTimes(2);
  });
});
