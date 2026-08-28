import initCarriage, { carriageKey } from '@client/scripts/carriage';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { EventEmitter } from 'events';
import eventBus from '@modules/core/eventBus';
import { setBehaviorSettings } from '@modules/core/settings';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  aliases: { pattern: RegExp; callback: Function }[] = [];
  carriageMode = false;
  carriageStopCommand: string | null = null;
  commandHooks: Array<(cmd: string, echo?: boolean, opts?: any) => any> = [];
  registerCommandHook(_id: string, cb: any) { this.commandHooks.push(cb); }
  moveModeButton = document.createElement('input');
  println = jest.fn();
  sendCommand = jest.fn();
  bindSlot: { printable: string | null } = { printable: null };
  FunctionalBind = {
    set: (printable: string | null, cb?: () => void) => {
      this.bindSlot.printable = printable;
      this.lastBindCallback = cb;
    },
    getCategory: () => ({ getPrintable: () => this.bindSlot.printable }),
    clearCategory: () => { this.bindSlot.printable = null; },
  };
  lastBindCallback?: () => void;
  sendEvent = jest.fn((type: string, payload?: any) => {
    this.emitter.emit(type, payload);
  });
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  Map = {
    currentRoom: { id: 100 } as { id: number },
    tryGetMapReader: () => ({ getRoom: (id: number) => ({ name: id === 999 ? String(id) : `Pokoj ${id}`, area: 7 }) }),
    getAreaName: (area: string) => (area === '7' ? 'Scala' : ''),
    /** Stand-in for the real resolver: identity unless a test says otherwise. */
    resolveDirection: jest.fn((direction: string) => direction),
  };
  /** Last payload the script pushed for a given sendEvent type. */
  lastEvent(type: string) {
    const call = [...this.sendEvent.mock.calls].reverse().find((c) => c[0] === type);
    return call ? call[1] : undefined;
  }
}

describe('carriage mode triggers', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initCarriage((client as unknown) as any);
    parse = (line: string, type = '') => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
  });

  test('turns carriage mode on and off', () => {
    parse('Siadasz w malej bryczce.');
    expect(client.carriageMode).toBe(true);
    expect(client.moveModeButton.disabled).toBe(true);
    parse('Zsiadasz z malej bryczki.');
    expect(client.carriageMode).toBe(false);
    expect(client.moveModeButton.disabled).toBe(false);
  });

  test('turns carriage mode on when boarding "na" a carriage', () => {
    parse('Siadasz na solidnym krytym wozie.');
    expect(client.carriageMode).toBe(true);
    expect(client.moveModeButton.disabled).toBe(true);
  });

  test('turns carriage mode off when returning a carriage', () => {
    client.carriageMode = true;
    client.moveModeButton.disabled = true;
    parse('Zwracasz elegancka odkryta bryczke w terminie odzyskujac calosc kaucji rowna jednej mithrylowej monecie.');
    expect(client.carriageMode).toBe(false);
    expect(client.moveModeButton.disabled).toBe(false);
  });

  test('announces carriage mode changes', () => {
    parse('Siadasz w malej bryczce.');
    expect(client.sendEvent).toHaveBeenCalledWith('carriageModeChanged', true);
    parse('Zsiadasz z malej bryczki.');
    expect(client.sendEvent).toHaveBeenCalledWith('carriageModeChanged', false);
  });

  test('/woz alias toggles carriage mode', () => {
    const woz = client.aliases.find((a) => a.pattern.test('/woz'));
    expect(woz).toBeDefined();
    woz!.callback([]);
    expect(client.carriageMode).toBe(true);
    expect(client.moveModeButton.disabled).toBe(true);
    woz!.callback([]);
    expect(client.carriageMode).toBe(false);
    expect(client.moveModeButton.disabled).toBe(false);
  });

  test('does not re-announce a mode that did not change', () => {
    parse('Siadasz w malej bryczce.');
    const announcements = () =>
      client.sendEvent.mock.calls.filter((c) => c[0] === 'carriageModeChanged').length;
    const before = announcements();

    // The transport tracker re-applies its last bind on every announcement, so repeating these
    // while already aboard would resurrect a stale transport bind.
    parse('Nieduzy jednokonny woz zatrzymuje sie.');
    parse('Dojechaliscie do rozdrozy.');
    parse('Nie ma tu zadnej drogi, ktora mozna by dalej jechac.');
    parse('Przeciez woz juz jedzie.');
    parse('Siadasz w malej bryczce.');
    expect(announcements()).toBe(before);

    parse('Zsiadasz z malej bryczki.');
    expect(announcements()).toBe(before + 1);
    parse('Zsiadasz z malej bryczki.');
    expect(announcements()).toBe(before + 1);
  });

  test('highlights the lines that end a ride', () => {
    const yellow = '#ffff00';
    for (const line of [
      'Dojechaliscie do rozdrozy.',
      'Nie ma tu zadnej drogi, ktora mozna by dalej jechac.',
    ]) {
      const result = parse(line)!;
      expect(result.text).toBe(line);
      const colors = result.getSegments().map((s: any) => s.state?.foreground?.color);
      expect(colors.every((c: string | undefined) => c === yellow)).toBe(true);
    }

    // The other re-arm lines are ordinary prose and stay untouched.
    const plain = parse('Przeciez woz juz jedzie.')!;
    expect(plain.getSegments().some((s: any) => s.state?.foreground?.color === yellow)).toBe(false);
  });

  test('re-arms carriage mode when the vehicle stops on its own', () => {
    const rearmLines = [
      'Przeciez woz juz jedzie.',
      'Dojechaliscie do rozdrozy.',
      'Nie ma tu zadnej drogi, ktora mozna by dalej jechac.',
      'Poza toba na malej bryczce siedzi Vesper.',
    ];
    for (const line of rearmLines) {
      client.carriageMode = false;
      client.moveModeButton.disabled = false;
      parse(line);
      expect(client.carriageMode).toBe(true);
    }
  });
});

describe('carriage key', () => {
  test('collapses every declined form of one carriage onto a single key', () => {
    const leased = carriageKey('elegancka odkryta bryczke');
    expect(leased).not.toBeNull();
    expect(carriageKey('eleganckiej odkrytej bryczce')).toBe(leased);
    expect(carriageKey('eleganckiej odkrytej bryczki')).toBe(leased);
  });

  test('keeps different carriages apart', () => {
    expect(carriageKey('malej bryczce')).not.toBe(carriageKey('duzej bryczce'));
    expect(carriageKey('solidnym krytym wozie')).not.toBe(carriageKey('malej bryczce'));
  });

  test('normalises the vehicle noun across cases', () => {
    expect(carriageKey('solidnym krytym wozie')).toBe(carriageKey('solidnego krytego wozu'));
    expect(carriageKey('wygodnym szybkim dylizansie')).toBe(carriageKey('wygodnego szybkiego dylizansu'));
  });

  test('rejects descriptions that do not end in a known vehicle', () => {
    expect(carriageKey('stary kon')).toBeNull();
    expect(carriageKey('')).toBeNull();
  });
});

describe('carriage bookkeeping', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;
  const records = () => characterStorage.get('carriages') ?? {};

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initCarriage((client as unknown) as any);
    parse = (line: string, type = '') => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
  });

  test('records the lease with the stable it was taken from', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Wynajmujesz lekki woz, placac dwadziescia piec zlotych monet kosztu najmu oraz jedna mithrylowa monete zwrotnej kaucji.');
    const record = records()[carriageKey('lekki woz')!];
    expect(record).toBeDefined();
    expect(record.name).toBe('lekki woz');
    expect(record.leasedIn).toBe(8555);
    expect(record.rent).toBe('dwadziescia piec zlotych monet');
    expect(record.deposit).toBe('jedna mithrylowa monete');
    expect(record.leasedAt).toBeGreaterThan(0);
  });

  test('also reads the shorter lease wording carried by the Mudlet package', () => {
    parse('Wynajmujesz elegancka odkryta bryczke placac dwie mithrylowe monety kosztu najmu jedna mithrylowa monete kaucji.');
    const record = records()[carriageKey('elegancka odkryta bryczke')!];
    expect(record).toBeDefined();
    expect(record.rent).toBe('dwie mithrylowe monety');
    expect(record.deposit).toBe('jedna mithrylowa monete');
  });

  test('a nominative lease matches the declined boarding and dismount lines', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Wynajmujesz lekki woz, placac dwadziescia piec zlotych monet kosztu najmu oraz jedna mithrylowa monete zwrotnej kaucji.');
    parse('Siadasz na lekkim wozie.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z lekkiego wozu.');

    const all = records();
    expect(Object.keys(all)).toHaveLength(1);
    expect(Object.values(all)[0].leasedIn).toBe(8555);
    expect(Object.values(all)[0].parkedIn).toBe(1234);
  });

  test('drops the record whichever case the return line uses', () => {
    for (const [board, ret] of [
      ['Siadasz na lekkim wozie.', 'Zwracasz lekki woz w terminie odzyskujac calosc kaucji.'],
      ['Siadasz w malej bryczce.', 'Zwracasz mala bryczka po terminie odzyskujac czesc kaucji.'],
      ['Siadasz w malej bryczce.', 'Zwracasz mala bryczke w terminie odzyskujac calosc kaucji.'],
    ]) {
      parse(board);
      parse(ret);
      expect(records()).toEqual({});
    }
  });

  test('boarding attaches to the lease taken moments earlier', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Wynajmujesz elegancka odkryta bryczke placac dwie mithrylowe monety kosztu najmu jedna mithrylowa monete kaucji.');
    parse('Siadasz w eleganckiej odkrytej bryczce.');
    const all = records();
    expect(Object.keys(all)).toHaveLength(1);
    expect(Object.values(all)[0].leasedIn).toBe(8555);
  });

  test('remembers where the carriage was left', () => {
    parse('Siadasz w malej bryczce.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z malej bryczki.');
    expect(records()[carriageKey('malej bryczce')!].parkedIn).toBe(1234);
  });

  test('getting up off the carriage parks it too', () => {
    parse('Siadasz w malej bryczce.');
    client.Map.currentRoom = { id: 4321 };
    parse('Wstajesz i wysiadasz z malej bryczki.');
    expect(records()[carriageKey('malej bryczce')!].parkedIn).toBe(4321);
  });

  test('tracks several carriages at once and drops only the returned one', () => {
    parse('Siadasz w malej bryczce.');
    client.Map.currentRoom = { id: 11 };
    parse('Zsiadasz z malej bryczki.');
    parse('Siadasz na solidnym krytym wozie.');
    client.Map.currentRoom = { id: 22 };
    parse('Zsiadasz z solidnego krytego wozu.');

    expect(Object.keys(records())).toHaveLength(2);

    parse('Zwracasz mala bryczke w terminie odzyskujac calosc kaucji.');
    const left = records();
    expect(Object.keys(left)).toHaveLength(1);
    expect(left[carriageKey('solidnym krytym wozie')!].parkedIn).toBe(22);
  });

  test('/wozw opens the popup with everything it needs to render', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Wynajmujesz elegancka odkryta bryczke placac dwie mithrylowe monety kosztu najmu jedna mithrylowa monete kaucji.');
    parse('Siadasz w eleganckiej odkrytej bryczce.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z eleganckiej odkrytej bryczki.');

    const opened = jest.fn();
    const off = eventBus.on('carriages.popup.open', opened);
    client.aliases.find((a) => a.pattern.test('/wozw'))!.callback([]);
    off?.();

    expect(opened).toHaveBeenCalledTimes(1);
    const payload = opened.mock.calls[0][0];
    expect(payload.currentLocationId).toBe(1234);
    expect(payload.carriages).toHaveLength(1);
    const entry = payload.carriages[0];
    expect(entry.name).toBe('elegancka odkryta bryczke');
    expect(entry.leasedIn).toBe(8555);
    expect(entry.leasedInLabel).toBe('Pokoj 8555, Scala (8555)');
    expect(entry.parkedIn).toBe(1234);
    expect(entry.parkedInLabel).toBe('Pokoj 1234, Scala (1234)');
    expect(entry.driven).toBe(false);
    expect(entry.depositExpiresAt).toBe(entry.leasedAt + 6 * 60 * 60 * 1000);
  });

  test('falls back to the bare id for a room whose name is just its id', () => {
    parse('Siadasz w malej bryczce.');
    client.Map.currentRoom = { id: 999 };
    parse('Zsiadasz z malej bryczki.');

    const opened = jest.fn();
    const off = eventBus.on('carriages.popup.open', opened);
    client.aliases.find((a) => a.pattern.test('/wozw'))!.callback([]);
    off?.();

    expect(opened.mock.calls[0][0].carriages[0].parkedInLabel).toBe('999');
  });

  test('/wozw opens an empty popup when nothing is held', () => {
    const opened = jest.fn();
    const off = eventBus.on('carriages.popup.open', opened);
    client.aliases.find((a) => a.pattern.test('/wozw'))!.callback([]);
    off?.();
    expect(opened.mock.calls[0][0].carriages).toEqual([]);
  });

  test('the popup can forget a carriage', () => {
    parse('Siadasz w malej bryczce.');
    client.Map.currentRoom = { id: 11 };
    parse('Zsiadasz z malej bryczki.');
    expect(Object.keys(records())).toHaveLength(1);

    eventBus.emit('carriages.remove', { key: carriageKey('malej bryczce')! });
    expect(records()).toEqual({});
  });

  test('marks parked carriages on the map and clears the marker while driving', () => {
    parse('Siadasz w malej bryczce.');
    client.Map.currentRoom = { id: 11 };
    parse('Zsiadasz z malej bryczki.');
    expect(client.lastEvent('mapParkedCarriages')).toEqual([{ roomId: 11, label: 'bryczka' }]);

    parse('Siadasz w malej bryczce.');
    expect(client.lastEvent('mapParkedCarriages')).toEqual([]);

    client.Map.currentRoom = { id: 22 };
    parse('Zsiadasz z malej bryczki.');
    expect(client.lastEvent('mapParkedCarriages')).toEqual([{ roomId: 22, label: 'bryczka' }]);

    parse('Zwracasz mala bryczke w terminie odzyskujac calosc kaucji.');
    expect(client.lastEvent('mapParkedCarriages')).toEqual([]);
  });

  test('leaves the bind alone at a dead end', () => {
    // Getting off is only one of the things to do there - turning around is the other - and the
    // bind this used to take over was usually the better offer.
    parse('Siadasz na solidnym krytym wozie.');
    parse('Nie ma tu zadnej drogi, ktora mozna by dalej jechac.');
    expect(client.bindSlot.printable).toBeNull();
  });

  test('binds the way back in when the carriage shows up in the room description', () => {
    // The map moves before the room text arrives, so the bind must come off the description line,
    // not off the location event - otherwise it prints above the room it belongs to.
    parse('Siadasz na nieduzym jednokonnym wozie.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z nieduzego jednokonnego wozu.');

    client.sendEvent('enterLocation', { id: 4321 });
    expect(client.bindSlot.printable).toBeNull();

    client.sendEvent('enterLocation', { id: 1234 });
    expect(client.bindSlot.printable).toBeNull();
    parse('Nieduzy jednokonny woz.', 'room.contents.object');
    expect(client.bindSlot.printable).toBe('usiadz na wozie');

    client.lastBindCallback!();
    expect(client.sendCommand).toHaveBeenCalledWith('usiadz na wozie');

    // Walking off again must not leave the bind pointing at a carriage that is elsewhere.
    client.sendEvent('enterLocation', { id: 4321 });
    expect(client.bindSlot.printable).toBeNull();
  });

  test('finds the carriage in a room description that lists several things', () => {
    parse('Siadasz na nieduzym jednokonnym wozie.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z nieduzego jednokonnego wozu.');

    for (const contents of [
      'Nieduzy jednokonny woz i kamienny menhir.',
      'Kamienny menhir i nieduzy jednokonny woz.',
      'Kamienny menhir, drewniana lawa i nieduzy jednokonny woz.',
      'Nieduzy jednokonny woz, kamienny menhir i drewniana lawa.',
    ]) {
      client.bindSlot.printable = null;
      parse(contents, 'room.contents.object');
      expect(client.bindSlot.printable).toBe('usiadz na wozie');
    }
  });

  test('ignores a vehicle in the room that is not one of ours', () => {
    parse('czarny stojacy dylizans', 'room.contents.object');
    parse('Nieduzy jednokonny woz.', 'room.contents.object');
    expect(client.bindSlot.printable).toBeNull();
  });

  test('does not offer the way back in while already driving', () => {
    parse('Siadasz na nieduzym jednokonnym wozie.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z nieduzego jednokonnego wozu.');
    parse('Siadasz na nieduzym jednokonnym wozie.');

    parse('Nieduzy jednokonny woz.', 'room.contents.object');
    expect(client.bindSlot.printable).toBeNull();
  });

  test('leaves a bind set by another script alone', () => {
    parse('Siadasz na nieduzym jednokonnym wozie.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z nieduzego jednokonnego wozu.');
    parse('Nieduzy jednokonny woz.', 'room.contents.object');
    expect(client.bindSlot.printable).toBe('usiadz na wozie');

    client.bindSlot.printable = 'uderz we wrota';
    client.sendEvent('enterLocation', { id: 4321 });
    expect(client.bindSlot.printable).toBe('uderz we wrota');
  });

  test('keeps the parking spot across a reload', () => {
    parse('Siadasz w malej bryczce.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z malej bryczki.');

    // A reload is a fresh init over the same storage.
    const reloaded = new FakeClient();
    initCarriage((reloaded as unknown) as any);
    const updated = jest.fn();
    const off = eventBus.on('carriages.updated', updated);
    eventBus.emit('carriages.request');
    off?.();

    const entry = updated.mock.calls.at(-1)![0].carriages[0];
    expect(entry.parkedIn).toBe(1234);
    expect(entry.driven).toBe(false);
  });

  test('still knows it is being driven across a reload', () => {
    client.Map.currentRoom = { id: 1234 };
    parse('Siadasz w malej bryczce.');

    const reloaded = new FakeClient();
    initCarriage((reloaded as unknown) as any);
    const updated = jest.fn();
    const off = eventBus.on('carriages.updated', updated);
    eventBus.emit('carriages.request');
    off?.();

    expect(updated.mock.calls.at(-1)![0].carriages[0].driven).toBe(true);
    // A carriage you are sitting in is not standing anywhere, so it must not be marked on the map.
    expect(reloaded.lastEvent('mapParkedCarriages')).toEqual([]);
  });

  test('tracks whether the carriage is rolling', () => {
    const moving = () => {
      const seen = jest.fn();
      const off = eventBus.on('carriages.updated', seen);
      eventBus.emit('carriages.request');
      off?.();
      return seen.mock.calls.at(-1)![0].carriages[0].moving;
    };

    parse('Siadasz na nieduzym jednokonnym wozie.');
    expect(moving()).toBe(false);

    parse('Nieduzy jednokonny woz rusza na zachod.');
    expect(moving()).toBe(true);

    parse('Nieduzy jednokonny woz zatrzymuje sie.');
    expect(moving()).toBe(false);

    // A dead end arrives before the stop line, so the ride is still "on" at that moment.
    parse('Nieduzy jednokonny woz rusza na wschod.');
    parse('Nie ma tu zadnej drogi, ktora mozna by dalej jechac.');
    expect(moving()).toBe(true);
    parse('Nieduzy jednokonny woz zatrzymuje sie.');
    expect(moving()).toBe(false);

    parse('Zsiadasz z nieduzego jednokonnego wozu.');
    expect(moving()).toBe(false);
  });

  test('a reconnect parks the carriage and puts us back on the ground', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    parse('Nieduzy jednokonny woz rusza na zachod.');

    client.Map.currentRoom = { id: 1234 };
    parse('Nawiazuje ponownie polaczenie z serwerem, przywracam polaczenie z postacia.');

    expect(client.carriageMode).toBe(false);
    expect(client.carriageStopCommand).toBeNull();
    const record = records()[carriageKey('nieduzy jednokonny woz')!];
    expect(record.driving).toBe(false);
    expect(record.parkedIn).toBe(1234);
    expect(client.lastEvent('mapParkedCarriages')).toEqual([{ roomId: 1234, label: 'woz' }]);
  });

  test('parks on the longer reconnect wording too', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    client.Map.currentRoom = { id: 1234 };
    // A drop of more than a few minutes is announced differently, and does not contain the phrase
    // the short form uses.
    parse('Twoje polaczenie zostalo przywrocone. Straciles polaczenie na 24 minuty 35 sekund.');

    expect(client.carriageMode).toBe(false);
    expect(records()[carriageKey('nieduzy jednokonny woz')!].parkedIn).toBe(1234);
  });

  test('leaving the world parks the carriage where we stood', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    parse('Nieduzy jednokonny woz rusza na zachod.');

    client.Map.currentRoom = { id: 4321 };
    parse('Opuszczasz realny swiat.');

    expect(client.carriageMode).toBe(false);
    expect(client.carriageStopCommand).toBeNull();
    const record = records()[carriageKey('nieduzy jednokonny woz')!];
    expect(record.driving).toBe(false);
    expect(record.parkedIn).toBe(4321);
    expect(client.lastEvent('mapParkedCarriages')).toEqual([{ roomId: 4321, label: 'woz' }]);
  });

  test('leaving the world on foot changes nothing', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z nieduzego jednokonnego wozu.');

    client.Map.currentRoom = { id: 4321 };
    parse('Opuszczasz realny swiat.');

    expect(records()[carriageKey('nieduzy jednokonny woz')!].parkedIn).toBe(1234);
  });

  test('a fresh session after a long drop parks the carriage where we last were', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    // The map persists the last room it rendered; nothing has moved us in the new session yet.
    characterStorage.set('mapperRoomId', 4242);

    // No reconnect line arrives at all — only the object number changing.
    client.sendEvent('reset');

    const record = records()[carriageKey('nieduzy jednokonny woz')!];
    expect(record.driving).toBe(false);
    expect(record.parkedIn).toBe(4242);
    expect(client.carriageMode).toBe(false);
    expect(client.lastEvent('mapParkedCarriages')).toEqual([{ roomId: 4242, label: 'woz' }]);

    // Where it went is only a guess, so the notice has to stand out and lead somewhere.
    const note = client.println.mock.calls.at(-1)![0];
    expect(note.text).toContain('zostal zaparkowany');
    expect(note.getSegments().some((s: any) => s.state?.foreground?.color === '#ffff00')).toBe(true);
    const link = note
      .getSegments()
      .map((s: any) => s.state?.hyperlink)
      .find((h: any) => h?.onClick);
    expect(link).toBeDefined();
    link.onClick();
    expect(client.sendEvent).toHaveBeenCalledWith('leadTo', 4242);
  });

  test('agrees the parked notice with the vehicle it is about', () => {
    parse('Siadasz w malej bryczce.');
    characterStorage.set('mapperRoomId', 11);
    client.sendEvent('reset');
    expect(client.println.mock.calls.at(-1)![0].text).toContain('zostala zaparkowana');
  });

  test('a fresh session on foot leaves the records alone', () => {
    client.Map.currentRoom = { id: 1234 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    parse('Zsiadasz z nieduzego jednokonnego wozu.');
    characterStorage.set('mapperRoomId', 9999);

    client.sendEvent('reset');
    expect(records()[carriageKey('nieduzy jednokonny woz')!].parkedIn).toBe(1234);
  });

  test('a reconnect on foot changes nothing', () => {
    client.Map.currentRoom = { id: 1234 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    parse('Zsiadasz z nieduzego jednokonnego wozu.');

    client.Map.currentRoom = { id: 9999 };
    parse('przywracam polaczenie');
    expect(records()[carriageKey('nieduzy jednokonny woz')!].parkedIn).toBe(1234);
  });

  test('seeing the carriage corrects a parking spot we noted wrong', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    parse('Nieduzy jednokonny woz rusza na zachod.');
    // Reconnect while the map still points at the room we set off from.
    parse('przywracam polaczenie');
    expect(records()[carriageKey('nieduzy jednokonny woz')!].parkedIn).toBe(8555);

    // The map catches up, and the carriage turns out to be standing here instead.
    client.Map.currentRoom = { id: 4321 };
    parse('Nieduzy jednokonny woz.', 'room.contents.object');
    expect(records()[carriageKey('nieduzy jednokonny woz')!].parkedIn).toBe(4321);
    expect(client.lastEvent('mapParkedCarriages')).toEqual([{ roomId: 4321, label: 'woz' }]);
  });

  test('reports the vehicle gender so the UI can agree with it', () => {
    const genderOf = (board: string) => {
      parse(board);
      const seen = jest.fn();
      const off = eventBus.on('carriages.updated', seen);
      eventBus.emit('carriages.request');
      off?.();
      const key = carriageKey(board.replace(/^Siadasz (?:w|na) /, '').replace(/\.$/, ''))!;
      return seen.mock.calls.at(-1)![0].carriages.find((c: any) => c.key === key).gender;
    };

    expect(genderOf('Siadasz w malej bryczce.')).toBe('f');
    parse('Zsiadasz z malej bryczki.');
    expect(genderOf('Siadasz na lekkim wozie.')).toBe('m');
    parse('Zsiadasz z lekkiego wozu.');
    expect(genderOf('Siadasz w wygodnym dylizansie.')).toBe('m');
  });

  describe('route binds while leading by carriage', () => {
    beforeEach(() => {
      setBehaviorSettings({ carriageRouteBinds: true });
      parse('Siadasz na nieduzym jednokonnym wozie.');
    });

    test('offers the next step while the wagon stands still', () => {
      client.sendEvent('carriageRouteStep', { nextCommand: 'w', atTransfer: false });
      expect(client.bindSlot.printable).toBe('w');
    });

    test('offers the way out once we are at the transfer point', () => {
      client.sendEvent('carriageRouteStep', { nextCommand: null, atTransfer: true });
      expect(client.bindSlot.printable).toBe('zsiadz z wozu');
    });

    test('takes the offer away while rolling and brings it back on stopping', () => {
      client.sendEvent('carriageRouteStep', { nextCommand: 'w', atTransfer: false });
      parse('Nieduzy jednokonny woz rusza na zachod.');
      expect(client.bindSlot.printable).toBeNull();

      parse('Nieduzy jednokonny woz zatrzymuje sie.');
      expect(client.bindSlot.printable).toBe('w');
    });

    test('keeps the route step when the road ends where the route turns off it', () => {
      // The dead end and the wagon's stop line arrive together, and neither may take the offer
      // away: the route knows where to go from here, and that is what the bind should still say.
      client.sendEvent('carriageRouteStep', { nextCommand: 'wem;kup bilet', atTransfer: false });
      parse('Nieduzy jednokonny woz rusza na zachod.');
      parse('Nie ma tu zadnej drogi, ktora mozna by dalej jechac.');
      parse('Nieduzy jednokonny woz zatrzymuje sie.');

      expect(client.bindSlot.printable).toBe('wem;kup bilet');
      client.lastBindCallback!();
      expect(client.sendCommand).toHaveBeenCalledWith('wem;kup bilet');
    });

    test('re-offers when the route changes under us', () => {
      client.sendEvent('carriageRouteStep', { nextCommand: 'w', atTransfer: false });
      // A blockade learned here sends us a different way.
      client.sendEvent('carriageRouteStep', { nextCommand: 'nw', atTransfer: false });
      expect(client.bindSlot.printable).toBe('nw');
    });

    test('drops the offer when leading ends', () => {
      client.sendEvent('carriageRouteStep', { nextCommand: 'w', atTransfer: false });
      client.sendEvent('carriageRouteStep', { nextCommand: null, atTransfer: false });
      expect(client.bindSlot.printable).toBeNull();
    });

    test('stays quiet while the option is off', () => {
      setBehaviorSettings({ carriageRouteBinds: false });
      client.sendEvent('carriageRouteStep', { nextCommand: 'w', atTransfer: false });
      expect(client.bindSlot.printable).toBeNull();
    });

    test('stays quiet on foot', () => {
      parse('Zsiadasz z nieduzego jednokonnego wozu.');
      client.sendEvent('carriageRouteStep', { nextCommand: 'w', atTransfer: false });
      expect(client.bindSlot.printable).toBeNull();
    });
  });

  describe('repeating a refused ride', () => {
    const hookFor = (command: string) => {
      const hook = client.commandHooks.at(-1)!;
      return hook(command, true, undefined);
    };

    beforeEach(() => {
      setBehaviorSettings({ dismountOnRefusedRide: true });
      client.Map.currentRoom = { id: 100 };
      parse('Siadasz na nieduzym jednokonnym wozie.');
      parse('Nie mozna jechac na poludnie.');
    });

    test('matches the short form of the direction the refusal spelled out', () => {
      // The game refuses with "poludnie"; the key you press sends "s". Comparing the two verbatim
      // meant the repeat never matched and nothing happened at all.
      expect(hookFor('s')).toBe('zsiadz z wozu;s');
      // Dropped here rather than waiting for "Zsiadasz", or the walk would be dressed up again.
      expect(client.carriageMode).toBe(false);
    });

    test('matches the long form too', () => {
      expect(hookFor('poludnie')).toBe('zsiadz z wozu;poludnie');
    });

    test('parks where we got off, not where we are heading', () => {
      const key = carriageKey('nieduzy jednokonny woz')!;
      hookFor('s');
      const parked = (characterStorage.get('carriages') ?? {})[key];
      expect(parked.parkedIn).toBe(100);
      expect(parked.driving).toBe(false);

      // The walk advances the mapper immediately, so the game's dismount line arrives a room late.
      client.Map.currentRoom = { id: 200 };
      parse('Zsiadasz z nieduzego jednokonnego wozu.');
      expect((characterStorage.get('carriages') ?? {})[key].parkedIn).toBe(100);
    });

    test('only for the way that was actually refused', () => {
      expect(hookFor('n')).toBeUndefined();
      expect(hookFor('polnoc')).toBeUndefined();
      expect(client.carriageMode).toBe(true);
    });

    test('only once - a later attempt is an ordinary command again', () => {
      hookFor('s');
      expect(hookFor('s')).toBeUndefined();
    });

    test('not after moving somewhere else', () => {
      client.sendEvent('enterLocation', { id: 200 });
      expect(hookFor('s')).toBeUndefined();
    });

    test('survives the room being rendered again where we stand', () => {
      // A GMCP re-sync renders the room we are already in, which used to look like a move and made
      // the repeat do nothing at all - the wagon never went anywhere.
      client.sendEvent('enterLocation', { id: 100 });
      expect(hookFor('s')).toBe('zsiadz z wozu;s');
    });

    test('takes the refusal off the prompt line', () => {
      client.sendEvent('enterLocation', { id: 200 });
      client.Map.currentRoom = { id: 200 };
      parse('> Nie mozna jechac na zachod.');
      expect(hookFor('w')).toBe('zsiadz z wozu;w');
    });

    test('matches up and down, which the refusal spells out as gora and dol', () => {
      for (const [refusal, short] of [
        ['Nie mozna jechac na dol.', 'd'],
        ['Nie mozna jechac na gore.', 'u'],
      ]) {
        parse('Siadasz na nieduzym jednokonnym wozie.');
        parse(refusal);
        expect(hookFor(short)).toBe(`zsiadz z wozu;${short}`);
      }
    });

    test('matches a special exit the map resolved the direction into', () => {
      // "w" in a room whose only westward exit is the special "barka" goes out as "jedz na barka",
      // and that is the name the refusal comes back with. Comparing the key that was pressed to it
      // never matched, so repeating the ride did nothing.
      client.Map.resolveDirection = jest.fn((direction: string) => (direction === 'w' ? 'barka' : direction));
      parse('Nie mozna jechac na barka.');
      expect(hookFor('w')).toBe('zsiadz z wozu;w');
    });

    test('matches a special exit typed out in full', () => {
      parse('Nie mozna jechac na barka.');
      expect(hookFor('barka')).toBe('zsiadz z wozu;barka');
    });

    test('does nothing while the option is off', () => {
      setBehaviorSettings({ dismountOnRefusedRide: false });
      expect(hookFor('s')).toBeUndefined();
      expect(client.carriageMode).toBe(true);
    });
  });

  test('publishes the halt command only while rolling', () => {
    parse('Siadasz na nieduzym jednokonnym wozie.');
    expect(client.carriageStopCommand).toBeNull();

    parse('Nieduzy jednokonny woz rusza na zachod.');
    expect(client.carriageStopCommand).toBe('zatrzymaj woz');

    parse('Nieduzy jednokonny woz zatrzymuje sie.');
    expect(client.carriageStopCommand).toBeNull();

    parse('Nieduzy jednokonny woz rusza na wschod.');
    parse('Zsiadasz z nieduzego jednokonnego wozu.');
    expect(client.carriageStopCommand).toBeNull();
  });

  test('halts each vehicle type in the accusative', () => {
    for (const [board, start, command] of [
      ['Siadasz w malej bryczce.', 'Mala bryczka rusza na zachod.', 'zatrzymaj bryczke'],
      ['Siadasz w wygodnym dylizansie.', 'Wygodny dylizans rusza na zachod.', 'zatrzymaj dylizans'],
    ]) {
      parse(board);
      parse(start);
      expect(client.carriageStopCommand).toBe(command);
      parse(board.replace('Siadasz w ', 'Zsiadasz z ').replace('bryczce', 'bryczki').replace('dylizansie', 'dylizansu'));
    }
  });

  test('ignores start and stop lines for a carriage that is not the one we are in', () => {
    parse('Siadasz na nieduzym jednokonnym wozie.');
    parse('Nieduzy jednokonny woz rusza na zachod.');

    // Somebody else's wagon, and a transport, both moving in the same room.
    parse('Drewniany jadacy woz powoli zatrzymuje sie.');
    parse('Wielka kryta bryczka zatrzymuje sie.');

    const seen = jest.fn();
    const off = eventBus.on('carriages.updated', seen);
    eventBus.emit('carriages.request');
    off?.();
    expect(seen.mock.calls.at(-1)![0].carriages[0].moving).toBe(true);
  });

  test('a start line re-arms carriage mode after a reload', () => {
    parse('Siadasz na nieduzym jednokonnym wozie.');

    const reloaded = new FakeClient();
    initCarriage((reloaded as unknown) as any);
    const reparse = (line: string) =>
      Triggers.prototype.parseLine.call(reloaded.Triggers, new AnsiAwareBuffer(line), '');

    expect(reloaded.carriageMode).toBe(false);
    reparse('Nieduzy jednokonny woz rusza na zachod.');
    expect(reloaded.carriageMode).toBe(true);
  });

  test('answers a request from a popup that was already open at load', () => {
    parse('Siadasz w malej bryczce.');
    client.Map.currentRoom = { id: 1234 };
    parse('Zsiadasz z malej bryczki.');

    const updated = jest.fn();
    const off = eventBus.on('carriages.updated', updated);
    eventBus.emit('carriages.request');
    off?.();

    // Every test registers another init against the shared bus, so only the payload is meaningful.
    expect(updated).toHaveBeenCalled();
    const payload = updated.mock.calls.at(-1)![0];
    expect(payload.carriages).toHaveLength(1);
    expect(payload.carriages[0].parkedIn).toBe(1234);
  });

  test('re-publishes markers when the map asks for them', () => {
    parse('Siadasz na solidnym krytym wozie.');
    client.Map.currentRoom = { id: 77 };
    parse('Zsiadasz z solidnego krytego wozu.');

    client.sendEvent.mockClear();
    client.sendEvent('requestMapParkedCarriages');
    expect(client.lastEvent('mapParkedCarriages')).toEqual([{ roomId: 77, label: 'woz' }]);
  });
});

describe('switching character', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;

  const recordsOf = (character: string) =>
    JSON.parse(localStorage.getItem(`${character}:carriages`) ?? '{}');

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('Woznica');
    client = new FakeClient();
    initCarriage((client as unknown) as any);
    parse = (line: string, type = '') => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
  });

  afterEach(() => {
    characterStorage.setCharacter('Woznica');
  });

  test('shows the new character its own carriages, not the ones we just left', () => {
    client.Map.currentRoom = { id: 1234 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    parse('Zsiadasz z nieduzego jednokonnego wozu.');
    expect(client.lastEvent('mapParkedCarriages')).toEqual([{ roomId: 1234, label: 'woz' }]);

    const seen = jest.fn();
    const off = eventBus.on('carriages.updated', seen);
    characterStorage.setCharacter('Furman');
    off?.();

    expect(seen.mock.calls.at(-1)![0].carriages).toEqual([]);
    expect(client.lastEvent('mapParkedCarriages')).toEqual([]);
    expect(client.carriageMode).toBe(false);
  });

  test('the ride we were on stays with the character we were driving it as', () => {
    client.Map.currentRoom = { id: 8555 };
    parse('Siadasz na nieduzym jednokonnym wozie.');
    expect(client.carriageMode).toBe(true);

    // Logging in as somebody else: the scope switches first, then the new object number lands.
    characterStorage.setCharacter('Furman');
    expect(client.carriageMode).toBe(false);
    characterStorage.set('mapperRoomId', 4242);
    client.sendEvent('reset');

    // Nothing of the other character's was touched - and nothing of ours was invented.
    expect(recordsOf('Furman')).toEqual({});
    const left = recordsOf('Woznica')[carriageKey('nieduzy jednokonny woz')!];
    expect(left.driving).toBe(true);
  });

  test('a wagon left ridden is parked when that character logs in', () => {
    // Woznica left a wagon marked as ridden in an earlier session, and this one started as Furman,
    // so the wagon is nowhere in memory: the switch has to hand `reset` the key it will park.
    const key = carriageKey('nieduzy jednokonny woz')!;
    localStorage.setItem('Woznica:carriages', JSON.stringify({
      [key]: {name: 'nieduzy jednokonny woz', leasedAt: 0, leasedIn: null, rent: null, deposit: null, parkedIn: null, driving: true},
    }));
    characterStorage.setCharacter('Furman');

    characterStorage.setCharacter('Woznica');
    characterStorage.set('mapperRoomId', 4242);
    client.sendEvent('reset');

    const record = recordsOf('Woznica')[key];
    expect(record.driving).toBe(false);
    expect(record.parkedIn).toBe(4242);
  });

  test('char.info repeating the same name leaves the ride alone', () => {
    parse('Siadasz na nieduzym jednokonnym wozie.');
    characterStorage.setCharacter('Woznica');
    expect(client.carriageMode).toBe(true);
  });
});
