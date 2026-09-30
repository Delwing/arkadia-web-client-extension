import initBrokilon from '@client/scripts/brokilon';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  Map = { moveBack: jest.fn() };
  FunctionalBind = { set: jest.fn() };
  println = jest.fn();
}

describe('brokilon triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initBrokilon(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('marks arrow lines', () => {
    expect(parse('Nagle jakas strzala wbija ci sie w korpus.')?.text).toBe('[ STRZALY ]  Nagle jakas strzala wbija ci sie w korpus.');
    expect(parse('Nagle jakas strzala wbija sie w drzewo obok ciebie.')?.text).toMatch(/^\[ STRZALY \]/);
  });

  test('treats the trap lines case-insensitively like upstream (?i)', () => {
    expect(parse('Rzemienna petla zaciska sie na twojej nodze.')?.text).toMatch(/^\[ PULAPKA \]/);
    expect(client.FunctionalBind.set).toHaveBeenCalledWith('przetnij rzemien');
    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('moves back when caught by the trap yourself', () => {
    parse('Nagle czujesz, ze cos oplata twa noge... ziemia w zawrotnym tempie zamienia sie miejscami z niebem. Zwisasz teraz, przywiazany za noge rzemieniem, dyndajac jak kukielka.');
    expect(client.Map.moveBack).toHaveBeenCalledTimes(1);
  });

  test('keeps the two charm triggers apart', () => {
    parse('Nie jestes w stanie skrzywdzic tak pieknej istoty!');
    expect(client.println).not.toHaveBeenCalled();
    expect(client.FunctionalBind.set).toHaveBeenCalledWith('/zz rusalke');

    parse('Wysoki elf zastyga nagle w miejscu.');
    expect(client.println).toHaveBeenCalledTimes(1);
  });
});
