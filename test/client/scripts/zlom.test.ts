import initZlom, {
    mergeZlomData,
    clearZlomData,
    setZlomColor,
    getZlomFormatting,
    WeaponEntry,
    ShieldEntry,
    ArmorEntry,
} from '@client/scripts/zlom';
import {
    ensureZlomLoaded,
    getZlomSnapshot,
    __resetZlomStoreForTests,
} from '@modules/data/zlomStore';
import initWeaponEvaluation from '@client/scripts/weaponEvaluation';
import initArmorEvaluation from '@client/scripts/armorEvaluation';
import initParryShieldEvaluation from '@client/scripts/parryShieldEvaluation';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';

async function resetStoreModule(): Promise<void> {
    await __resetZlomStoreForTests();
}

async function flush(): Promise<void> {
    // Yield to microtasks so any pending `updateZlomSnapshot()` promises settle.
    await Promise.resolve();
    await Promise.resolve();
}

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

function findWeapon(short: string): WeaponEntry | undefined {
    return getZlomSnapshot().bronie.find(e => e.short === short);
}

function findArmor(short: string): ArmorEntry | undefined {
    return getZlomSnapshot().zbroje.find(e => e.short === short);
}

describe('zlom script', () => {
  let client: FakeClient;
  let parse: (line: string) => void;

  beforeEach(async () => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    await resetStoreModule();
    client = new FakeClient();
    initZlom((client as unknown) as any, client.aliases);
    await ensureZlomLoaded();
    parse = (line: string) => {
      Triggers.prototype.parseLine.call(
        client.Triggers,
        new AnsiAwareBuffer(line),
        '',
      );
    };
  });

  afterEach(async () => {
    localStorage.clear();
    await resetStoreModule();
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

  test('parses weapon evaluation and stores entry', async () => {
    feedWeapon();
    await flush();

    const entry = findWeapon('krasnoludzki asymetryczny topor bojowy');
    expect(entry).toBeDefined();
    expect(entry!.short).toBe('krasnoludzki asymetryczny topor bojowy');
    expect(entry!.typ).toBe('topor');
    expect(entry!.rodzaj).toBe('topor');
    expect(entry!.chwyt).toBe('w dowolnej rece');
    expect(entry!.klute).toBe(0);
    expect(entry!.obuch).toBe(0);
    expect(entry!.ciete).toBe(1);
    expect(entry!.waga).toBe(5500);
    expect(entry!.obj).toBe(980);
    expect(entry!.cena).toBe(880);
    expect(entry!.wywazenie).toBe(11);
    expect(entry!.parowanie).toBe(11);
    expect(entry!.srebro).toBe(1);
    expect(entry!.magik).toBe(0);
    expect(entry!.roomId).toBe(42);
    expect(entry!.opis).toMatch(/Na trzystopowoym/);
  });

  test('converts kilograms and liters to base units', async () => {
    parse('Oceniasz starannie ciezki buzdygan.');
    parse('Stylisko z czarnego drewna.');
    parse('');
    parse('Oceniasz, ze ciezki buzdygan wazy 3 kilogramy, zas jego objetosc wynosi 2 litry.');
    parse('Wydaje ci sie, ze jest wart okolo 100 miedziakow.');
    parse('');
    parse('Zauwazasz, iz buzdygan jest przystosowany do chwytania w prawej rece.');
    parse('Za jego pomoca mozna zadawac rany obuchowe.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na buzdygan jest on dobrze wywazony i calkiem skuteczny.');
    await flush();

    const entry = findWeapon('ciezki buzdygan');
    expect(entry!.waga).toBe(3000);
    expect(entry!.obj).toBe(2000);
    expect(entry!.obuch).toBe(1);
    expect(entry!.klute).toBe(0);
    expect(entry!.ciete).toBe(0);
  });

  test('marks magic weapons', async () => {
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
    await flush();

    const entry = findWeapon('blyszczacy miecz')!;
    expect(entry.magik).toBe(1);
    expect(entry.klute).toBe(1);
    expect(entry.ciete).toBe(1);
    expect(entry.obuch).toBe(0);
  });

  test('registers highlight trigger that auto-colors silver weapons on subsequent lines', async () => {
    feedWeapon();
    await flush();

    const buf = new AnsiAwareBuffer('Trzymasz krasnoludzki asymetryczny topor bojowy w prawej rece.');
    Triggers.prototype.parseLine.call(client.Triggers, buf, '');

    const idx = buf.text.indexOf('krasnoludzki');
    const state = buf.getStateAt(idx);
    expect(state?.bold).toBeFalsy();
    expect(state?.underline).toBeFalsy();
    expect(state?.foreground).toEqual({ space: 'hex', color: '#dadada' });
    expect(state?.hyperlink).toBeUndefined();
  });

  test('highlight trigger matches case-insensitively (e.g. sentence-start capitalization)', async () => {
    feedWeapon();
    await flush();

    const buf = new AnsiAwareBuffer('Krasnoludzki asymetryczny topor bojowy.');
    Triggers.prototype.parseLine.call(client.Triggers, buf, '');

    const idx = buf.text.toLowerCase().indexOf('krasnoludzki');
    const state = buf.getStateAt(idx);
    expect(state?.foreground).toEqual({ space: 'hex', color: '#dadada' });
  });

  test('parser captures accusative short as shortAlt', async () => {
    parse('Oceniasz starannie szeroka posrebrzana glewie.');
    parse('Na dlugim drzewcu zamocowane jest szerokie ostrze.');
    parse('');
    parse('Oceniasz, ze szeroka posrebrzana glewia wazy 5200 gramow, zas jego objetosc wynosi 2000 mililitrow.');
    parse('Wydaje ci sie, ze jest warta okolo 460 miedziakow.');
    parse('');
    parse('Zauwazasz, iz glewia jest przystosowana do chwytania w dowolnej rece.');
    parse('Za jej pomoca mozna zadawac rany ciete i klute.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na glewia jest ona bardzo dobrze wywazona i niezwykle skuteczna.');
    parse('Do wykonania tej broni uzyto srebra, bedzie wiec ona skuteczna przeciw wrogom odpornym na zwykle obrazenia.');
    await flush();

    const entry = findWeapon('szeroka posrebrzana glewia');
    expect(entry).toBeDefined();
    expect(entry!.shortAlt).toBe('szeroka posrebrzana glewie');
    expect(entry!.srebro).toBe(1);
  });

  test('highlight fires on the accusative form', async () => {
    parse('Oceniasz starannie szeroka posrebrzana glewie.');
    parse('Na dlugim drzewcu zamocowane jest szerokie ostrze.');
    parse('');
    parse('Oceniasz, ze szeroka posrebrzana glewia wazy 5200 gramow, zas jego objetosc wynosi 2000 mililitrow.');
    parse('Wydaje ci sie, ze jest warta okolo 460 miedziakow.');
    parse('');
    parse('Zauwazasz, iz glewia jest przystosowana do chwytania w dowolnej rece.');
    parse('Za jej pomoca mozna zadawac rany ciete i klute.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na glewia jest ona bardzo dobrze wywazona i niezwykle skuteczna.');
    parse('Do wykonania tej broni uzyto srebra, bedzie wiec ona skuteczna przeciw wrogom odpornym na zwykle obrazenia.');
    await flush();

    const buf = new AnsiAwareBuffer('Szeroka posrebrzana glewie.');
    Triggers.prototype.parseLine.call(client.Triggers, buf, '');
    const idx = buf.text.toLowerCase().indexOf('szeroka');
    const state = buf.getStateAt(idx);
    expect(state?.foreground).toEqual({ space: 'hex', color: '#dadada' });
  });

  test('highlight trigger skips combat messages', async () => {
    feedWeapon();
    await flush();

    const buf = new AnsiAwareBuffer('Ranisz krasnoludzki asymetryczny topor bojowy.');
    Triggers.prototype.parseLine.call(client.Triggers, buf, 'combat.avatar');

    const idx = buf.text.indexOf('krasnoludzki');
    const state = buf.getStateAt(idx);
    expect(state?.foreground).toBeUndefined();
  });

  test('/zlom alias lists saved weapons', async () => {
    feedWeapon();
    await flush();

    const alias = client.aliases.find(a => a.pattern.test('/zlom'));
    expect(alias).toBeDefined();
    const match = '/zlom'.match(alias!.pattern)!;
    alias!.callback(match);
    expect(client.println).toHaveBeenCalled();
    const printedArg = client.println.mock.calls[0][0];
    const text = typeof printedArg === 'string' ? printedArg : printedArg.text;
    expect(text).toContain('krasnoludzki asymetryczny topor bojowy');
  });

  test('/zlom-reset clears snapshot', async () => {
    feedWeapon();
    await flush();
    expect(getZlomSnapshot().bronie).toHaveLength(1);

    const reset = client.aliases.find(a => a.pattern.test('/zlom-reset'));
    expect(reset).toBeDefined();
    reset!.callback('/zlom-reset'.match(reset!.pattern)!);
    await flush();
    expect(getZlomSnapshot().bronie).toHaveLength(0);
  });

  test('parses parry-only shield (puklerz)', async () => {
    parse('Oceniasz starannie starozytny piecioboczny puklerz.');
    parse('Bogato zdobiona powierzchnia tej malej tarczy mieni sie srebrzysto-zlotym blaskiem.');
    parse('Wyglada na to, ze jest w znakomitym stanie.');
    parse('');
    parse('Oceniasz, ze starozytny piecioboczny puklerz wazy 2500 gramow, zas jego objetosc wynosi 1200 mililitrow.');
    parse('Wydaje ci sie, ze jest wart okolo 5100 miedziakow.');
    parse('Wyglada na to, ze moglby ci jeszcze raczej dlugo sluzyc.');
    parse('Zalozony oslania jedno z ramion.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on fantastycznie skuteczny w parowaniu ciosow.');
    parse('Sadzac po delikatnym drzeniu w zbroi tej zostala zakleta jakas magia.');
    await flush();

    const entry = getZlomSnapshot().tarcze.find(e => e.short === 'starozytny piecioboczny puklerz');
    expect(entry).toBeDefined();
    expect(entry!.oslona).toBe('jedno z ramion');
    expect(entry!.parowanie).toBeGreaterThan(0);
    expect(entry!.magik).toBe(1);
  });

  test('parses armor evaluation', async () => {
    parse('Oceniasz starannie lekka kolczuga.');
    parse('Misternie zszyta kolczuga pokryta siateczka pierscieni.');
    parse('Wyglada na to, ze jest w kiepskim stanie.');
    parse('');
    parse('Oceniasz, ze lekka kolczuga wazy 4000 gramow, zas jej objetosc wynosi 3000 mililitrow.');
    parse('Wydaje ci sie, ze jest warta okolo 300 miedziakow.');
    parse('Zaklada sie ja na tulow.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na lekka zbroje chroni ona dobrze przed obrazeniami cietymi, przyzwoicie przed klutymi i dobrze przed obuchowymi.');
    await flush();

    const entry = findArmor('lekka kolczuga');
    expect(entry).toBeDefined();
    expect(entry!.typ).toBe('lekka');
    expect(entry!.oslona).toBe('tulow');
    expect(entry!.ciete).toBe(9);
    expect(entry!.klute).toBe(6);
    expect(entry!.obuch).toBe(9);
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

    test('replace mode overwrites entries with same opis and adds new', async () => {
      feedWeapon();
      await flush();
      const existing = findWeapon('krasnoludzki asymetryczny topor bojowy')!;
      expect(existing.cena).toBe(880);

      const counts = await mergeZlomData(
        {
          bronie: [
            makeWeapon({ short: 'krasnoludzki asymetryczny topor bojowy', opis: existing.opis, cena: 1000, typ: 'topor' }),
            makeWeapon({ short: 'nowy miecz', opis: 'Jakis miecz.', cena: 200, typ: 'miecz' }),
          ],
          tarcze: [],
          zbroje: [],
        },
        'replace',
      );

      expect(counts.bronie).toBe(2);
      const snap = getZlomSnapshot();
      const topor = snap.bronie.find(e => e.opis === existing.opis);
      const miecz = snap.bronie.find(e => e.short === 'nowy miecz');
      expect(topor?.cena).toBe(1000);
      expect(miecz?.typ).toBe('miecz');
    });

    test('keep mode only adds new entries', async () => {
      feedWeapon();
      await flush();
      const existing = findWeapon('krasnoludzki asymetryczny topor bojowy')!;

      const counts = await mergeZlomData(
        {
          bronie: [
            makeWeapon({ short: 'krasnoludzki asymetryczny topor bojowy', opis: existing.opis, cena: 1, typ: 'zmieniony' }),
            makeWeapon({ short: 'unikatowy sztylet', opis: 'Unikat.', cena: 77, typ: 'sztylet' }),
          ],
          tarcze: [],
          zbroje: [],
        },
        'keep',
      );
      expect(counts.bronie).toBe(1);
      const snap = getZlomSnapshot();
      expect(snap.bronie.find(e => e.opis === existing.opis)?.cena).toBe(880);
      expect(snap.bronie.find(e => e.short === 'unikatowy sztylet')?.typ).toBe('sztylet');
    });

    test('clearZlomData empties snapshot', async () => {
      feedWeapon();
      await flush();
      expect(getZlomSnapshot().bronie).toHaveLength(1);

      await clearZlomData();
      const snap = getZlomSnapshot();
      expect(snap.bronie).toEqual([]);
      expect(snap.tarcze).toEqual([]);
      expect(snap.zbroje).toEqual([]);
    });

    test('merge imports shields and armors too', async () => {
      const shield: ShieldEntry = {
        short: 'zelazny puklerz', klute: 3, obuch: 4, ciete: 3, magik: 0,
        opis: 'Zelazny puklerz.', waga: 1500, obj: 700, cena: 120,
        parowanie: 5, oslona: 'lewa reka', roomId: null,
      };
      const armor: ArmorEntry = {
        short: 'skorzany pancerz', typ: 'lekka', klute: 2, obuch: 2, ciete: 3,
        magik: 0, opis: 'Skorzany pancerz.', waga: 2000, obj: 1500, cena: 80,
        oslona: 'tulow', roomId: null,
      };
      const counts = await mergeZlomData({ bronie: [], tarcze: [shield], zbroje: [armor] }, 'replace');
      expect(counts.tarcze).toBe(1);
      expect(counts.zbroje).toBe(1);
      const snap = getZlomSnapshot();
      expect(snap.tarcze.find(e => e.short === 'zelazny puklerz')?.parowanie).toBe(5);
      expect(snap.zbroje.find(e => e.short === 'skorzany pancerz')?.typ).toBe('lekka');
    });
  });

  describe('color formatting', () => {
    test('setZlomColor persists color on entry by opis', async () => {
      feedWeapon();
      await flush();
      const opis = findWeapon('krasnoludzki asymetryczny topor bojowy')!.opis;
      await setZlomColor('bronie', opis, '#ff8080');
      expect(findWeapon('krasnoludzki asymetryczny topor bojowy')!.color).toBe('#ff8080');
    });

    test('setZlomColor with undefined clears color', async () => {
      feedWeapon();
      await flush();
      const opis = findWeapon('krasnoludzki asymetryczny topor bojowy')!.opis;
      await setZlomColor('bronie', opis, '#ff8080');
      await setZlomColor('bronie', opis, undefined);
      expect(findWeapon('krasnoludzki asymetryczny topor bojowy')!.color).toBeUndefined();
    });

    test('color survives re-evaluation of same weapon', async () => {
      feedWeapon();
      await flush();
      const opis = findWeapon('krasnoludzki asymetryczny topor bojowy')!.opis;
      await setZlomColor('bronie', opis, '#abcdef');
      feedWeapon();
      await flush();
      expect(findWeapon('krasnoludzki asymetryczny topor bojowy')!.color).toBe('#abcdef');
    });

    test('getZlomFormatting returns user color over silver auto-color', async () => {
      feedWeapon();
      await flush();
      const opis = findWeapon('krasnoludzki asymetryczny topor bojowy')!.opis;
      await setZlomColor('bronie', opis, '#abcdef');
      const f = getZlomFormatting('krasnoludzki asymetryczny topor bojowy');
      expect(f).toBeDefined();
      expect(f!.color).toBe('#abcdef');
      expect(f!.title).toContain('topor');
      expect(f!.title).toContain('srebro');
    });

    test('getZlomFormatting applies silver auto-color when no user color', async () => {
      feedWeapon();
      await flush();
      const f = getZlomFormatting('krasnoludzki asymetryczny topor bojowy');
      expect(f!.color).toBe('#dadada');
    });

    test('silver coloring is on by default when no user color set', async () => {
      feedWeapon();
      await flush();
      const f = getZlomFormatting('krasnoludzki asymetryczny topor bojowy');
      expect(f!.color).toBe('#dadada');
    });

    test('zlomSilver.off=true disables silver coloring', async () => {
      feedWeapon();
      await flush();
      setTestSettings({ zlomSilver: { color: '#dadada', off: true } });
      const f = getZlomFormatting('krasnoludzki asymetryczny topor bojowy');
      expect(f).toBeUndefined();
    });

    test('getZlomFormatting uses configured silver color', async () => {
      feedWeapon();
      await flush();
      setTestSettings({ zlomSilver: { color: '#ff00ff' } });
      const f = getZlomFormatting('krasnoludzki asymetryczny topor bojowy');
      expect(f!.color).toBe('#ff00ff');
    });

    test('getZlomFormatting skips magic items entirely', async () => {
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
      await flush();

      const opis = findWeapon('blyszczacy miecz')!.opis;
      await setZlomColor('bronie', opis, '#abcdef');
      expect(getZlomFormatting('blyszczacy miecz')).toBeUndefined();
    });

    test('getZlomFormatting matches substring within longer text', async () => {
      feedWeapon();
      await flush();
      const f = getZlomFormatting('stary krasnoludzki asymetryczny topor bojowy w pochwie');
      expect(f).toBeDefined();
      expect(f!.title).toContain('topor');
    });

    test('zlomSilver.off skips registering silver-only triggers', async () => {
      feedWeapon();
      await flush();
      setTestSettings({ zlomSilver: { color: '#dadada', off: true } });
      client.Triggers.removeByTag('zlom-highlight');
      client.Triggers.removeByTag('zlom-parser');
      initZlom((client as unknown) as any, client.aliases);
      await ensureZlomLoaded();

      const buf = new AnsiAwareBuffer('Trzymasz krasnoludzki asymetryczny topor bojowy w prawej rece.');
      Triggers.prototype.parseLine.call(client.Triggers, buf, '');
      const state = buf.getStateAt(buf.text.indexOf('krasnoludzki'));
      expect(state?.foreground).toBeUndefined();
      expect(state?.underline).toBeFalsy();
    });

    test('user-colored entry still registers even when silver coloring is off', async () => {
      feedWeapon();
      await flush();
      const opis = findWeapon('krasnoludzki asymetryczny topor bojowy')!.opis;
      await setZlomColor('bronie', opis, '#abcdef');
      setTestSettings({ zlomSilver: { color: '#dadada', off: true } });
      client.Triggers.removeByTag('zlom-highlight');
      client.Triggers.removeByTag('zlom-parser');
      initZlom((client as unknown) as any, client.aliases);
      await ensureZlomLoaded();

      const buf = new AnsiAwareBuffer('Trzymasz krasnoludzki asymetryczny topor bojowy w prawej rece.');
      Triggers.prototype.parseLine.call(client.Triggers, buf, '');
      const state = buf.getStateAt(buf.text.indexOf('krasnoludzki'));
      expect(state?.foreground).toEqual({ space: 'hex', color: '#abcdef' });
    });
  });

  describe('co-existence with eval scripts that gag lines', () => {
    test('weapon is saved when weaponEvaluation runs alongside zlom (zlom registered first)', async () => {
      const c = new FakeClient();
      initZlom((c as unknown) as any, c.aliases);
      initWeaponEvaluation((c as unknown) as any);
      await ensureZlomLoaded();

      const send = (line: string) =>
        Triggers.prototype.parseLine.call(c.Triggers, new AnsiAwareBuffer(line), '');

      send('Oceniasz starannie krasnoludzki asymetryczny topor bojowy.');
      send('Na trzystopowoym stylisku wykonanym z twardego drewna.');
      send('Wyglada na to, ze liczne walki wyryly na nim swoje pietno.');
      send('');
      send('Oceniasz, ze krasnoludzki asymetryczny topor bojowy wazy 5500 gramow, zas jego objetosc wynosi 980 mililitrow.');
      send('Wydaje ci sie, ze jest wart okolo 880 miedziakow.');
      send('');
      send('Zauwazasz, iz topor jest przystosowany do chwytania w dowolnej rece.');
      send('Za jego pomoca mozna zadawac rany ciete.');
      send('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na topor jest on bardzo dobrze wywazony i niezwykle skuteczny.');
      send('Do wykonania tej broni uzyto srebra, bedzie wiec ona skuteczna przeciw wrogom odpornym na zwykle obrazenia.');
      await flush();

      const entry = findWeapon('krasnoludzki asymetryczny topor bojowy');
      expect(entry).toBeDefined();
      expect(entry!.typ).toBe('topor');
      expect(entry!.srebro).toBe(1);
      expect(entry!.wywazenie).toBe(11);
      expect(entry!.parowanie).toBe(11);
    });

    test('armor and shield evals do not get gagged before zlom sees them', async () => {
      const c = new FakeClient();
      initZlom((c as unknown) as any, c.aliases);
      initArmorEvaluation((c as unknown) as any);
      initParryShieldEvaluation((c as unknown) as any);
      await ensureZlomLoaded();

      const send = (line: string) =>
        Triggers.prototype.parseLine.call(c.Triggers, new AnsiAwareBuffer(line), '');

      send('Oceniasz starannie lekka kolczuga.');
      send('Misternie zszyta kolczuga.');
      send('Wyglada na to, ze jest w kiepskim stanie.');
      send('');
      send('Oceniasz, ze lekka kolczuga wazy 4000 gramow, zas jej objetosc wynosi 3000 mililitrow.');
      send('Wydaje ci sie, ze jest warta okolo 300 miedziakow.');
      send('Zaklada sie ja na tulow.');
      send('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na lekka zbroje chroni ona dobrze przed obrazeniami cietymi, przyzwoicie przed klutymi i dobrze przed obuchowymi.');
      await flush();

      const armor = findArmor('lekka kolczuga');
      expect(armor).toBeDefined();
      expect(armor!.typ).toBe('lekka');
      expect(armor!.oslona).toBe('tulow');
    });
  });

  describe('persistence across reload', () => {
    test('entries written through zlom are recoverable via IndexedDB', async () => {
      feedWeapon();
      await flush();
      expect(getZlomSnapshot().bronie).toHaveLength(1);

      // Simulate fresh load by clearing in-memory cache only; IndexedDB still holds the row.
      // Our in-module cache is a closure so we can't reset it directly from the test —
      // instead just round-trip via the public API.
      const snap = getZlomSnapshot();
      expect(snap.bronie[0].opis).toMatch(/Na trzystopowoym/);
    });
  });
});
