import initDrowning from '@client/scripts/drowning';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  Map = {
    moveBack: jest.fn(),
    move: jest.fn(),
    paused: false
  };
}

describe('drowning triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initDrowning((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('colors wave drowning line cyan and moves down', () => {
    const result = parse('Ponad twoja glowa przelamuje sie potezna sztormowa fala, ktora wciska cie w glebine.');
    expect(result?.text).toBe('Ponad twoja glowa przelamuje sie potezna sztormowa fala, ktora wciska cie w glebine.');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
    expect(client.Map.move).toHaveBeenCalledWith('d', true);
  });

  test('colors current drowning line cyan and moves down', () => {
    const result = parse('Nie masz juz sil walczyc z zywiolem i dajesz sie poniesc pradowi na dol.');
    expect(result?.text).toBe('Nie masz juz sil walczyc z zywiolem i dajesz sie poniesc pradowi na dol.');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
    expect(client.Map.move).toHaveBeenCalledWith('d', true);
  });

  test('moves back on map first when pauser is on, then moves down', () => {
    client.Map.paused = true;
    const result = parse('Ponad twoja glowa przelamuje sie potezna sztormowa fala, ktora wciska cie w glebine.');
    expect(result?.text).toBe('Ponad twoja glowa przelamuje sie potezna sztormowa fala, ktora wciska cie w glebine.');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
    expect(client.Map.moveBack).toHaveBeenCalled();
    expect(client.Map.move).toHaveBeenCalledWith('d', true);
  });

  test('does not move back when pauser is off', () => {
    client.Map.paused = false;
    const result = parse('Nie masz juz sil walczyc z zywiolem i dajesz sie poniesc pradowi na dol.');
    expect(result?.text).toBe('Nie masz juz sil walczyc z zywiolem i dajesz sie poniesc pradowi na dol.');
    expect(result).toBeInstanceOf(AnsiAwareBuffer);
    expect(client.Map.moveBack).not.toHaveBeenCalled();
    expect(client.Map.move).toHaveBeenCalledWith('d', true);
  });
});
