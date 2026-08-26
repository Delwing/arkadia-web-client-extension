import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import initGates from '@client/scripts/gates';
import { setBehaviorSettings } from '@modules/core/settings';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), setCategory: jest.fn(), clear: jest.fn(), clearCategory: jest.fn(), newMessage: jest.fn() };
  Map = { currentRoom: null as any, executeBind: jest.fn() };
  sendCommand = jest.fn();

  private handlers = new Map<string, ((detail: any) => void)[]>();

  on = jest.fn((event: string, cb: (detail: any) => void, options?: { once?: boolean; signal?: AbortSignal }) => {
    const wrapped = (detail: any) => {
      if (options?.signal?.aborted) return;
      if (options?.once) {
        this.handlers.set(event, (this.handlers.get(event) ?? []).filter(h => h !== wrapped));
      }
      cb(detail);
    };
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), wrapped]);
    return () => {};
  });

  emit(event: string, detail?: any) {
    [...(this.handlers.get(event) ?? [])].forEach(cb => cb(detail));
  }
}

describe('gates triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    localStorage.clear();
    client = new FakeClient();
    jest.clearAllMocks();
    initGates((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('binding is set and callback sends command', () => {
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledWith('gates', null, expect.any(Function));
    const initCb = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0][2];
    initCb();
    expect(client.Map.executeBind).toHaveBeenCalledWith('uderz we wrota');

    parse('Probujesz otworzyc masywne wrota.');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(2);
    const [category, label, cb] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[1];
    expect(category).toBe('gates');
    expect(label).toBe('uderz we wrota');
    cb();
    expect(client.Map.executeBind).toHaveBeenCalledTimes(2);
  });

  test('niewielka furtka pattern', () => {
    parse('Probujesz otworzyc niewielka furtke.');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(2);
  });

  test('uses userData.gate when the location defines its own gate command', () => {
    client.Map.currentRoom = { id: 7, userData: { gate: 'zapukaj w brame' } };

    parse('Probujesz otworzyc masywna brame.');

    const [, label, cb] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[1];
    expect(label).toBe('zapukaj w brame');
    cb();
    expect(client.Map.executeBind).toHaveBeenCalledWith('zapukaj w brame');
  });

  test('printable strips the bind delay syntax', () => {
    client.Map.currentRoom = { id: 8, userData: { gate: 'zapukaj w brame#wejdz*2' } };

    parse('Probujesz otworzyc zardzewiala krate.');

    const [, label] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[1];
    expect(label).toBe('zapukaj w brame;wejdz');
  });

  describe('gateAsFunctionalBind option', () => {
    function enter(room: any) {
      client.Map.currentRoom = room;
      client.emit('enterLocation', { id: room?.id ?? null });
      client.emit('output-sent', 1);
    }

    test('is off by default - entering a gate location sets no bind', () => {
      enter({ id: 10, userData: { gate: 'uderz w brame' } });

      expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1); // only the init call
    });

    test('sets the gate bind on entering a gate location when enabled', () => {
      setBehaviorSettings({ gateAsFunctionalBind: true });

      enter({ id: 10, userData: { gate: 'uderz w brame' } });

      const [category, label] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[1];
      expect(category).toBe('gates');
      expect(label).toBe('uderz w brame');
    });

    test('does not set the bind when the room changed before the output was sent', () => {
      setBehaviorSettings({ gateAsFunctionalBind: true });

      client.Map.currentRoom = { id: 10, userData: { gate: 'uderz w brame' } };
      client.emit('enterLocation', { id: 10 });
      client.Map.currentRoom = { id: 11, userData: {} };
      client.emit('output-sent', 1);

      expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    });

    test('clears the gate bind when entering a location without a gate', () => {
      setBehaviorSettings({ gateAsFunctionalBind: true });

      enter({ id: 12, userData: {} });

      expect(client.FunctionalBind.clearCategory).toHaveBeenCalledWith('gates');
    });

    test('does not set the bind when crossing from one gate location to another', () => {
      setBehaviorSettings({ gateAsFunctionalBind: true });

      enter({ id: 10, userData: { gate: 'uderz w brame' } });
      (client.FunctionalBind.setCategory as jest.Mock).mockClear();

      enter({ id: 11, userData: { gate: 'uderz w brame' } });

      expect(client.FunctionalBind.setCategory).not.toHaveBeenCalled();
      expect(client.FunctionalBind.clearCategory).toHaveBeenCalledWith('gates');
    });

    test('sets the bind again after leaving the gate area and coming back', () => {
      setBehaviorSettings({ gateAsFunctionalBind: true });

      enter({ id: 10, userData: { gate: 'uderz w brame' } });
      enter({ id: 11, userData: { gate: 'uderz w brame' } });
      enter({ id: 12, userData: {} });
      (client.FunctionalBind.setCategory as jest.Mock).mockClear();

      enter({ id: 11, userData: { gate: 'uderz w brame' } });

      const [category, label] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
      expect(category).toBe('gates');
      expect(label).toBe('uderz w brame');
    });

    test('the closed-gate trigger still sets the bind after crossing', () => {
      setBehaviorSettings({ gateAsFunctionalBind: true });

      enter({ id: 10, userData: { gate: 'uderz w brame' } });
      enter({ id: 11, userData: { gate: 'uderz w brame' } });
      (client.FunctionalBind.setCategory as jest.Mock).mockClear();

      parse('Probujesz otworzyc masywna brame.');

      const [category, label] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
      expect(category).toBe('gates');
      expect(label).toBe('uderz w brame');
    });
  });
});
