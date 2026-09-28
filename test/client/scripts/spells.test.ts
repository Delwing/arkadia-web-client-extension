import initSpells from '@client/scripts/spells';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { createColorFormat } from '@modules/core/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  sendEvent = jest.fn();
  playSound = jest.fn();
}

const BLUR = 'Wpierw twoje dlonie, a potem ksztalty calego ciala staja sie zupelnie niewyrazne. Trudno bedzie cie teraz dojrzec lub dosiegnac bronia.';
const AURA = 'Miedzy toba a wysokim magiem formuje sie strumien czarnej energii.';
const STUN = 'Nagle zrywa sie potezna wichura, ktora sprawia, ze wokol momentalnie zaczyna sie prawdziwe pieklo... Kiedy furia burzy osiaga apogeum, wiatr unosi cie i poniewiera toba jak szmaciana lalka! Po dluzszej chwili podmuchy wydaja sie zamierac, jednak ostatni z nich rzuca cie ciezko na podloze, tak ze tracisz przytomosc.';
const BLINDED_OTHER = 'Wysoki elf rozglada sie pustym spojrzeniem, tak jakby stracil wzrok.';

describe('spell triggers', () => {
  let parseBuffer: (line: string) => AnsiAwareBuffer | null;
  let parse: (line: string) => string | undefined;

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    const client = new FakeClient();
    initSpells((client as unknown) as any);
    parseBuffer = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    parse = (line: string) => parseBuffer(line)?.text;
  });

  test('labels blur cast on me', () => {
    expect(parse(BLUR)).toContain(`[ ROZMYCIE ] ${BLUR}`);
  });

  test.each([
    ["Czujesz, ze efekt dzialania czaru 'rozmycie' konczy sie, a ty na powrot stajesz sie dla wszystkich wyraznie widoczny.", 'ROZMYCIE END'],
    ["Czujesz, ze efekt dzialania czaru 'przeobrazenie' konczy sie.", 'PRZEOBRAZENIE END'],
  ])('labels any spell ending on me: %s', (line, label) => {
    expect(parse(line)).toContain(`[ ${label} ] ${line}`);
  });

  test('leaves disarm end to its own gag', () => {
    const line = "Czujesz, ze efekt dzialania czaru 'rozbrojenie postaci' konczy sie i powoli odzyskujesz czucie w swoich dloniach.";
    expect(parse(line)).toBe(line);
  });

  describe('follows the combat gag settings', () => {
    test('keep leaves the line without a prefix', () => {
      characterStorage.set('lua_gags_delete_lines', { czary_we_mnie: 0 });
      expect(parse(BLUR)).toBe(BLUR);
      expect(parse(BLINDED_OTHER)).toContain('[ OSLEPIENIE ]');
    });

    test('delete removes the line', () => {
      characterStorage.set('lua_gags_delete_lines', { czary_innych: 1 });
      expect(parseBuffer(BLINDED_OTHER)).toBeNull();
      expect(parse(BLUR)).toContain("[ ROZMYCIE ]");
    });

    test('delete keeps lines that carry a warning', () => {
      characterStorage.set('lua_gags_delete_lines', { czary_we_mnie: 1 });
      const result = parseBuffer(AURA);
      expect(result?.deleted).toBe(false);
      expect(result?.text).toBe(`${AURA}\n\t\t\t <><> UWAGA NA SWOJE HP <><> `);
    });

    test('prefix uses the configured colour', () => {
      characterStorage.set('lua_gags_colors', { czary_we_mnie: '#123456' });
      const result = parseBuffer(BLUR)!;
      expect(result.getStateAt(result.text.indexOf("ROZMYCIE"))?.foreground).toEqual(createColorFormat("#123456").foreground);
    });

    test("stun alert keeps its own colour and survives delete", () => {
      characterStorage.set("lua_gags_delete_lines", { czary_we_mnie: 1 });
      characterStorage.set("lua_gags_colors", { czary_we_mnie: "#123456" });
      const result = parseBuffer(STUN)!;
      expect(result.deleted).toBe(false);
      expect(result.text).toBe(`${STUN}
[   OGLUCH   ] ----- JESTES OGLUSZONY -----

`);
      expect(result.getStateAt(result.text.indexOf("OGLUCH"))?.foreground).toEqual(createColorFormat("#ff0000").foreground);
    });
  });
});
