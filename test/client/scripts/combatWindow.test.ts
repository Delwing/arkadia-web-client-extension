import initCombatWindow, {
    getCombatHistory,
    isConditionLine,
    setCombatConditionCapture,
    setCombatConditionsToMain,
} from '@client/scripts/combatWindow';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  handlers: Record<string, ((payload?: unknown) => void)[]> = {};
  on = jest.fn((event: string, handler: (payload?: unknown) => void) => {
    (this.handlers[event] ??= []).push(handler);
  });
  print = jest.fn();
  fire(event: string, payload?: unknown) {
    this.handlers[event]?.forEach((h) => h(payload));
  }
}

describe('combat window condition lines (Kondycje)', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initCombatWindow((client as unknown) as any);
    parse = (line: string, type = '') =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
    getCombatHistory().length = 0;
  });

  afterEach(() => {
    setCombatConditionCapture(false);
    setCombatConditionsToMain(true);
    getCombatHistory().length = 0;
  });

  test.each([
    'Jestes w swietnej kondycji.',
    'Jest ledwo zywa.',
    'Wysoki elf jest ciezko ranny.',
    'Ty jestes lekko ranny.',
    'Krasnolud jest w dobrym stanie.',
  ])('recognises "%s"', (line) => {
    expect(isConditionLine(line)).toBe(true);
  });

  test.each([
    'Wyglada na to, ze jest ranny.',
    'Ork jest wysoki.',
    'Najest w dobrym stanie.',
  ])('ignores "%s"', (line) => {
    expect(isConditionLine(line)).toBe(false);
  });

  test('a condition line is copied to the window and stays in main', () => {
    setCombatConditionCapture(true);
    const result = parse('Goblin jest ciezko ranny.');

    expect(result).not.toBeNull();
    expect(result!.text).toBe('Goblin jest ciezko ranny.');
    expect(getCombatHistory()).toHaveLength(1);
    expect(getCombatHistory()[0]).toMatchObject({ type: 'hp', alsoInMain: true });
  });

  test('with conditionsToMain off the line is moved to the window', () => {
    setCombatConditionCapture(true);
    setCombatConditionsToMain(false);
    const result = parse('Goblin jest ciezko ranny.');

    expect(result).toBeNull();
    expect(getCombatHistory()).toHaveLength(1);
    expect(getCombatHistory()[0]).not.toHaveProperty('alsoInMain');
  });

  test('nothing is copied while capture is off', () => {
    parse('Goblin jest ciezko ranny.');
    expect(getCombatHistory()).toHaveLength(0);
  });

  describe('room separator', () => {
    const types = () => getCombatHistory().map((e) => e.type);

    beforeEach(() => setCombatConditionCapture(true));

    test('a room change after a message adds one separator', () => {
      parse('Goblin jest ciezko ranny.');
      client.fire('command', 'n');
      client.fire('gmcp.room.info', {});
      client.fire('gmcp.room.info', {});
      expect(types()).toEqual(['hp', 'separator']);
    });

    test.each(['sp', 'spojrz', 'zerknij'])('looking around with "%s" adds none', (look) => {
      parse('Goblin jest ciezko ranny.');
      client.fire('command', look);
      client.fire('gmcp.room.info', {});
      expect(types()).toEqual(['hp']);
    });
  });

  test('combat-typed lines are not copied as conditions', () => {
    setCombatConditionCapture(true);
    parse('Ork jest ciezko ranny.', 'combat.others');
    expect(getCombatHistory()).toHaveLength(0);
  });
});
