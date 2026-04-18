import initZlom, {
    loadZlomSnapshot,
    mergeZlomData,
    clearZlomData,
    setZlomColor,
    getZlomFormatting,
    WeaponEntry,
    ShieldEntry,
    ArmorEntry,
} from '@client/scripts/zlom';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';

class FakeMap {
  currentRoom: { id: number } | null = { id: 42 };
}

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  Map = new FakeMap();
  print = jest.fn();
  println = jest.fn();
  aliases: { pattern: RegExp; callback: Function }[] = [];
}

describe('zlom script', () => {
  let client: FakeClient;
  let parse: (line: string) => void;

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initZlom((client as unknown) as any, client.aliases);
    parse = (line: string) => {
      Triggers.prototype.parseLine.call(
        client.Triggers,
        new AnsiAwareBuffer(line),
        '',
      );
    };
  });

  afterEach(() => {
    localStorage.clear();
  });

  function feedWeapon() {
    parse('Oceniasz starannie krasnoludzki asymetryczny topor bojowy.');
    parse('Na trzystopowoym stylisku wykonanym z twardego drewna i wzmocnionym stalowymi okuciami zostalo osadzone ostrze o wypuklym zarysie i asymetrycznej formie.');
    parse('Wyglada na to, ze liczne walki wyryly na nim swoje pietno.');
    parse('');
    parse('Oceniasz, ze krasnoludzki asymetryczny topor bojowy wazy 5500 gramow, zas jego objetosc wynosi 980 mililitrow.');
    parse('Wydaje ci sie, ze jest wart okolo 880 miedziakow.');
    parse('');
    parse('Zauwazasz, iz topor jest przystosowany do chwytania w dowolnej rece.');
    parse('Za jego pomoca mozna zadawac rany ciete.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na topor jest on bardzo dobrze wywazony i niezwykle skuteczny.');
    parse('Do wykonania tej broni uzyto srebra, bedzie wiec ona skuteczna przeciw wrogom odpornym na zwykle obrazenia.');
  }

  test('parses weapon evaluation and stores entry', () => {
    feedWeapon();

    const snap = loadZlomSnapshot();
    const entry = snap.bronie['krasnoludzki asymetryczny topor bojowy'];
    expect(entry).toBeDefined();
    expect(entry.short).toBe('krasnoludzki asymetryczny topor bojowy');
    expect(entry.typ).toBe('topor');
    expect(entry.rodzaj).toBe('topor');
    expect(entry.chwyt).toBe('w dowolnej rece');
    expect(entry.klute).toBe(0);
    expect(entry.obuch).toBe(0);
    expect(entry.ciete).toBe(1);
    expect(entry.waga).toBe(5500);
    expect(entry.obj).toBe(980);
    expect(entry.cena).toBe(880);
    expect(entry.wywazenie).toBe(11); // "bardzo dobrze" = 11
    expect(entry.parowanie).toBe(11); // "niezwykle skuteczny" = 11
    expect(entry.srebro).toBe(1);
    expect(entry.magik).toBe(0);
    expect(entry.roomId).toBe(42);
    expect(entry.opis).toMatch(/Na trzystopowoym/);
  });

  test('converts kilograms and liters to base units', () => {
    parse('Oceniasz starannie ciezki buzdygan.');
    parse('Stylisko z czarnego drewna.');
    parse('');
    parse('Oceniasz, ze ciezki buzdygan wazy 3 kilogramy, zas jego objetosc wynosi 2 litry.');
    parse('Wydaje ci sie, ze jest wart okolo 100 miedziakow.');
    parse('');
    parse('Zauwazasz, iz buzdygan jest przystosowany do chwytania w prawej rece.');
    parse('Za jego pomoca mozna zadawac rany obuchowe.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na buzdygan jest on dobrze wywazony i calkiem skuteczny.');

    const entry = loadZlomSnapshot().bronie['ciezki buzdygan'];
    expect(entry.waga).toBe(3000);
    expect(entry.obj).toBe(2000);
    expect(entry.obuch).toBe(1);
    expect(entry.klute).toBe(0);
    expect(entry.ciete).toBe(0);
  });

  test('marks magic weapons', () => {
    parse('Oceniasz starannie blyszczacy miecz.');
    parse('Drobne znamiona swietego symbolu zdobia glownie.');
    parse('');
    parse('Oceniasz, ze blyszczacy miecz wazy 2000 gramow, zas jego objetosc wynosi 500 mililitrow.');
    parse('Wydaje ci sie, ze jest wart okolo 500 miedziakow.');
    parse('');
    parse('Zauwazasz, iz miecz jest przystosowany do chwytania w dowolnej rece.');
    parse('Za jego pomoca mozna zadawac rany ciete i klute.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na miecz jest on przyzwoicie wywazony i dosyc skuteczny.');
    parse('Sadzac po delikatnym drzeniu w broni tej zostala zakleta jakas magia, bedzie wiec ona skuteczna przeciw wrogom odpornym na zwykle obrazenia.');

    const entry = loadZlomSnapshot().bronie['blyszczacy miecz'];
    expect(entry.magik).toBe(1);
    expect(entry.klute).toBe(1);
    expect(entry.ciete).toBe(1);
    expect(entry.obuch).toBe(0);
  });

  test('registers highlight trigger that underlines silver weapons on subsequent lines', () => {
    feedWeapon();

    const buf = new AnsiAwareBuffer('Trzymasz krasnoludzki asymetryczny topor bojowy w prawej rece.');
    Triggers.prototype.parseLine.call(client.Triggers, buf, '');

    const idx = buf.text.indexOf('krasnoludzki');
    const state = buf.getStateAt(idx);
    expect(state?.bold).toBe(true);
    expect(state?.underline).toBe(true);
    expect(state?.hyperlink?.title).toContain('topor');
    expect(state?.hyperlink?.title).toContain('srebro');
  });

  test('/zlom alias lists saved weapons', () => {
    feedWeapon();
    const alias = client.aliases.find(a => a.pattern.test('/zlom'));
    expect(alias).toBeDefined();
    const match = '/zlom'.match(alias!.pattern)!;
    alias!.callback(match);
    expect(client.println).toHaveBeenCalled();
    const printedArg = client.println.mock.calls[0][0];
    const text = typeof printedArg === 'string' ? printedArg : printedArg.text;
    expect(text).toContain('krasnoludzki asymetryczny topor bojowy');
  });

  test('/zlom-reset clears snapshot', () => {
    feedWeapon();
    expect(Object.keys(loadZlomSnapshot().bronie)).toHaveLength(1);

    const reset = client.aliases.find(a => a.pattern.test('/zlom-reset'));
    expect(reset).toBeDefined();
    reset!.callback('/zlom-reset'.match(reset!.pattern)!);
    expect(Object.keys(loadZlomSnapshot().bronie)).toHaveLength(0);
  });

  test('parses armor evaluation', () => {
    parse('Oceniasz starannie lekka kolczuga.');
    parse('Misternie zszyta kolczuga pokryta siateczka pierscieni.');
    parse('Wyglada na to, ze jest w kiepskim stanie.');
    parse('');
    parse('Oceniasz, ze lekka kolczuga wazy 4000 gramow, zas jej objetosc wynosi 3000 mililitrow.');
    parse('Wydaje ci sie, ze jest warta okolo 300 miedziakow.');
    parse('Zaklada sie ja na tulow.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na lekka zbroje chroni ona dobrze przed obrazeniami cietymi, przyzwoicie przed klutymi i dobrze przed obuchowymi.');

    const entry = loadZlomSnapshot().zbroje['lekka kolczuga'];
    expect(entry).toBeDefined();
    expect(entry.typ).toBe('lekka');
    expect(entry.oslona).toBe('tulow');
    expect(entry.ciete).toBe(9); // dobrze
    expect(entry.klute).toBe(6); // przyzwoicie
    expect(entry.obuch).toBe(9); // dobrze
  });

  describe('import / merge', () => {
    function makeWeapon(partial: Partial<WeaponEntry>): WeaponEntry {
      return {
        short: '',
        typ: '',
        rodzaj: '',
        klute: 0,
        obuch: 0,
        ciete: 0,
        chwyt: '',
        magik: 0,
        srebro: 0,
        opis: '',
        waga: 0,
        obj: 0,
        cena: 0,
        wywazenie: 0,
        parowanie: 0,
        roomId: null,
        ...partial,
      };
    }

    test('replace mode overwrites existing entries and adds new', () => {
      feedWeapon();
      const existing = loadZlomSnapshot().bronie['krasnoludzki asymetryczny topor bojowy'];
      expect(existing.cena).toBe(880);

      const counts = mergeZlomData(
        {
          bronie: [
            makeWeapon({ short: 'krasnoludzki asymetryczny topor bojowy', cena: 1000, typ: 'topor' }),
            makeWeapon({ short: 'nowy miecz', cena: 200, typ: 'miecz' }),
          ],
          tarcze: [],
          zbroje: [],
        },
        'replace',
      );

      expect(counts.bronie).toBe(2);
      const snap = loadZlomSnapshot();
      expect(snap.bronie['krasnoludzki asymetryczny topor bojowy'].cena).toBe(1000);
      expect(snap.bronie['nowy miecz'].typ).toBe('miecz');
    });

    test('keep mode only adds new entries', () => {
      feedWeapon();
      const counts = mergeZlomData(
        {
          bronie: [
            makeWeapon({ short: 'krasnoludzki asymetryczny topor bojowy', cena: 1, typ: 'zmieniony' }),
            makeWeapon({ short: 'unikatowy sztylet', cena: 77, typ: 'sztylet' }),
          ],
          tarcze: [],
          zbroje: [],
        },
        'keep',
      );
      expect(counts.bronie).toBe(1);
      const snap = loadZlomSnapshot();
      expect(snap.bronie['krasnoludzki asymetryczny topor bojowy'].cena).toBe(880);
      expect(snap.bronie['unikatowy sztylet'].typ).toBe('sztylet');
    });

    test('clearZlomData empties snapshot', () => {
      feedWeapon();
      expect(Object.keys(loadZlomSnapshot().bronie)).toHaveLength(1);
      clearZlomData();
      const snap = loadZlomSnapshot();
      expect(snap.bronie).toEqual({});
      expect(snap.tarcze).toEqual({});
      expect(snap.zbroje).toEqual({});
    });

    test('merge imports shields and armors too', () => {
      const shield: ShieldEntry = {
        short: 'zelazny puklerz',
        klute: 3,
        obuch: 4,
        ciete: 3,
        magik: 0,
        opis: '',
        waga: 1500,
        obj: 700,
        cena: 120,
        parowanie: 5,
        oslona: 'lewa reka',
        roomId: null,
      };
      const armor: ArmorEntry = {
        short: 'skorzany pancerz',
        typ: 'lekka',
        klute: 2,
        obuch: 2,
        ciete: 3,
        magik: 0,
        opis: '',
        waga: 2000,
        obj: 1500,
        cena: 80,
        oslona: 'tulow',
        roomId: null,
      };
      const counts = mergeZlomData({ bronie: [], tarcze: [shield], zbroje: [armor] }, 'replace');
      expect(counts.tarcze).toBe(1);
      expect(counts.zbroje).toBe(1);
      const snap = loadZlomSnapshot();
      expect(snap.tarcze['zelazny puklerz'].parowanie).toBe(5);
      expect(snap.zbroje['skorzany pancerz'].typ).toBe('lekka');
    });
  });

  describe('color formatting', () => {
    test('setZlomColor persists color on entry', () => {
      feedWeapon();
      setZlomColor('bronie', 'krasnoludzki asymetryczny topor bojowy', '#ff8080');
      expect(loadZlomSnapshot().bronie['krasnoludzki asymetryczny topor bojowy'].color).toBe('#ff8080');
    });

    test('setZlomColor with undefined clears color', () => {
      feedWeapon();
      setZlomColor('bronie', 'krasnoludzki asymetryczny topor bojowy', '#ff8080');
      setZlomColor('bronie', 'krasnoludzki asymetryczny topor bojowy', undefined);
      expect(loadZlomSnapshot().bronie['krasnoludzki asymetryczny topor bojowy'].color).toBeUndefined();
    });

    test('color survives re-evaluation of same weapon', () => {
      feedWeapon();
      setZlomColor('bronie', 'krasnoludzki asymetryczny topor bojowy', '#abcdef');
      feedWeapon();
      expect(loadZlomSnapshot().bronie['krasnoludzki asymetryczny topor bojowy'].color).toBe('#abcdef');
    });

    test('getZlomFormatting returns color + underline for silver weapon', () => {
      feedWeapon();
      setZlomColor('bronie', 'krasnoludzki asymetryczny topor bojowy', '#abcdef');
      const f = getZlomFormatting('krasnoludzki asymetryczny topor bojowy');
      expect(f).toBeDefined();
      expect(f!.color).toBe('#abcdef');
      expect(f!.underline).toBe(true);
      expect(f!.title).toContain('topor');
      expect(f!.title).toContain('srebro');
    });

    test('getZlomFormatting honors colorSilver=false', () => {
      feedWeapon();
      const f = getZlomFormatting('krasnoludzki asymetryczny topor bojowy', { colorSilver: false });
      expect(f!.underline).toBe(false);
    });

    test('getZlomFormatting matches substring within longer text', () => {
      feedWeapon();
      const f = getZlomFormatting('stary krasnoludzki asymetryczny topor bojowy w pochwie');
      expect(f).toBeDefined();
      expect(f!.title).toContain('topor');
    });

    test('highlight applies user color to in-game line', () => {
      feedWeapon();
      setZlomColor('bronie', 'krasnoludzki asymetryczny topor bojowy', '#aabbcc');
      // Reinitialize triggers so the new color is picked up
      client.Triggers.removeByTag('zlom-highlight');
      client.Triggers.removeByTag('zlom-parser');
      initZlom((client as unknown) as any, client.aliases);

      const buf = new AnsiAwareBuffer('Trzymasz krasnoludzki asymetryczny topor bojowy w prawej rece.');
      Triggers.prototype.parseLine.call(client.Triggers, buf, '');
      const state = buf.getStateAt(buf.text.indexOf('krasnoludzki'));
      expect(state?.foreground).toEqual({ space: 'hex', color: '#aabbcc' });
    });

    test('zlomColorSilver=false disables underline on highlight', () => {
      feedWeapon();
      setTestSettings({ zlomColorSilver: false });
      client.Triggers.removeByTag('zlom-highlight');
      client.Triggers.removeByTag('zlom-parser');
      initZlom((client as unknown) as any, client.aliases);

      const buf = new AnsiAwareBuffer('Trzymasz krasnoludzki asymetryczny topor bojowy w prawej rece.');
      Triggers.prototype.parseLine.call(client.Triggers, buf, '');
      const state = buf.getStateAt(buf.text.indexOf('krasnoludzki'));
      expect(state?.bold).toBe(true);
      expect(state?.underline).toBeFalsy();
    });
  });
});
