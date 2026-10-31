import initTrainerSkills from '@client/scripts/trainerSkills';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  sendCommand = jest.fn();
}

describe('trainer skill list', () => {
  let client: FakeClient;
  const parse = (line: string) =>
    Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '') as AnsiAwareBuffer;

  const links = (buffer: AnsiAwareBuffer) =>
    buffer.toHyperlinkSegments().filter(s => s.hyperlink?.onClick);

  beforeEach(() => {
    client = new FakeClient();
    initTrainerSkills((client as unknown) as any);
  });

  test('links each skill name to trenuj', () => {
    parse('Oto umiejetnosci, w jakich mozesz sie szkolic:');
    expect(links(parse('  Umiejetnosc:               Koszt sesji treningowej:'))).toHaveLength(0);
    expect(links(parse('-------------------------------------------------------'))).toHaveLength(0);

    const herb = links(parse('  zielarstwo                4 zlote i 10 miedzianych monet'));
    expect(herb).toHaveLength(1);
    expect(herb[0].text).toBe('zielarstwo');
    herb[0].hyperlink!.onClick!({} as MouseEvent);
    expect(client.sendCommand).toHaveBeenCalledWith('trenuj zielarstwo');

    const traps = links(parse('  wykrywanie pulapek        8 zlotych, 2 srebrne i 9 miedzianych monet'));
    expect(traps).toHaveLength(1);
    expect(traps[0].text).toBe('wykrywanie pulapek');
    traps[0].hyperlink!.onClick!({} as MouseEvent);
    expect(client.sendCommand).toHaveBeenLastCalledWith('trenuj wykrywanie pulapek');

    const animals = links(parse('  opieka nad zwierzetami    5 zlotych, 16 srebrnych i 3 miedziane monety'));
    expect(animals[0].text).toBe('opieka nad zwierzetami');
  });

  test('ignores price-like lines without the header', () => {
    expect(links(parse('  zielarstwo                4 zlote i 10 miedzianych monet'))).toHaveLength(0);
  });
});
