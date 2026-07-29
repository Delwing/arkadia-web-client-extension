import initMapCorrections from '@client/scripts/mapCorrections';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  Map = {
    currentRoom: undefined as { id: number; area: number } | undefined,
    moveBack: jest.fn()
  };
  listeners: Record<string, Function[]> = {};
  on = (event: string, listener: Function) => {
    (this.listeners[event] ??= []).push(listener);
    return () => {};
  };
  emit(event: string) {
    this.listeners[event]?.forEach(l => l());
  }
}

const NO_EXIT = 'Nie widzisz zadnego wyjscia prowadzacego na polnoc.';

describe('map corrections', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initMapCorrections((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('steps back in a corrected area', () => {
    client.Map.currentRoom = { id: 1000, area: 52 };
    const result = parse(NO_EXIT);
    expect(result?.text).toBe(NO_EXIT);
    expect(client.Map.moveBack).toHaveBeenCalled();
  });

  test('does not step back outside corrected areas', () => {
    client.Map.currentRoom = { id: 1000, area: 1 };
    parse(NO_EXIT);
    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('steps back for a listed Stirland room only', () => {
    client.Map.currentRoom = { id: 11370, area: 35 };
    parse(NO_EXIT);
    expect(client.Map.moveBack).toHaveBeenCalled();

    client.Map.moveBack.mockClear();
    client.Map.currentRoom = { id: 99999, area: 35 };
    parse(NO_EXIT);
    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('steps back for a listed Varieno room only', () => {
    client.Map.currentRoom = { id: 20586, area: 44 };
    parse(NO_EXIT);
    expect(client.Map.moveBack).toHaveBeenCalled();

    client.Map.moveBack.mockClear();
    client.Map.currentRoom = { id: 99999, area: 44 };
    parse(NO_EXIT);
    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('skips the excluded room range', () => {
    client.Map.currentRoom = { id: 20850, area: 52 };
    parse(NO_EXIT);
    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('ignores non-standard directions', () => {
    client.Map.currentRoom = { id: 1000, area: 52 };
    parse('Nie widzisz zadnego wyjscia prowadzacego na brame.');
    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('does not correct when the room has not changed since last exits update', () => {
    client.Map.currentRoom = { id: 1000, area: 52 };
    client.emit('gmcp_msg.room.exits');
    parse(NO_EXIT);
    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('corrects again once the room changed after the last exits update', () => {
    client.Map.currentRoom = { id: 1000, area: 52 };
    client.emit('gmcp_msg.room.exits');
    client.Map.currentRoom = { id: 1001, area: 52 };
    parse(NO_EXIT);
    expect(client.Map.moveBack).toHaveBeenCalled();
  });

  test('handles a prompt prefix on the line', () => {
    client.Map.currentRoom = { id: 1000, area: 52 };
    parse(`> ${NO_EXIT}`);
    expect(client.Map.moveBack).toHaveBeenCalled();
  });
});
