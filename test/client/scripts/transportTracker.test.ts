import initTransportTracker from '@client/scripts/transportTracker';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setGmcp } from '@client/gmcp';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  aliases: { pattern: RegExp; callback: Function }[] = [];
  carriageMode = false;
  println = jest.fn();
  sendCommand = jest.fn();
  now = () => Date.now();
  Map = { setMapRoomById: jest.fn() };
  teammates: { num: number; desc?: string }[] = [];
  TeamManager = {
    getTeamObjectsOnLocation: () => this.teammates,
  };
  transportBind: { label: string | null; callback?: () => void } = { label: null };
  FunctionalBind = {
    setCategory: (_category: string, label: string, cb: () => void) => {
      this.transportBind = { label, callback: cb };
    },
    clearCategory: () => {
      this.transportBind = { label: null };
    },
  };
  sendEvent = jest.fn((type: string, payload?: any) => {
    this.emitter.emit(type, payload);
  });
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
}

describe('transport board bind team tickets', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;

  // 6429 is the Ancelmus dock on Blekitna Wstega; "Wielka galera" is its standing pattern,
  // and its board commands are wem;kup bilet;wsiadz na statek;wlm.
  const dockAndSight = () => {
    client.sendEvent('enterLocation', { id: 6429 });
    parse('Wielka galera', 'room.contents.object');
  };

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initTransportTracker((client as unknown) as any);
    parse = (line: string, type = '') =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
  });

  test('on foot the board bind buys a single ticket even with a team', () => {
    client.teammates = [{ num: 111 }];
    dockAndSight();
    expect(client.transportBind.label).toBe('wem;kup bilet;wsiadz na statek;wlm [Blekitna Wstega - Kreutzhofen]');
  });

  test('driving aboard with a team buys and hands over a ticket per teammate', () => {
    client.carriageMode = true;
    client.teammates = [{ num: 111 }, { num: 222 }];
    dockAndSight();
    expect(client.transportBind.label).toBe(
      'wem;kup bilet;kup bilet;daj bilet ob_111;kup bilet;daj bilet ob_222;wjedz na statek;wlm [Blekitna Wstega - Kreutzhofen]'
    );

    client.transportBind.callback!();
    expect(client.sendCommand.mock.calls.map(c => c[0])).toEqual([
      'wem',
      'kup bilet',
      'kup bilet',
      'daj bilet ob_111',
      'kup bilet',
      'daj bilet ob_222',
      'wjedz na statek',
      'wlm',
    ]);
  });

  test('driving aboard solo keeps the plain sequence', () => {
    client.carriageMode = true;
    dockAndSight();
    expect(client.transportBind.label).toBe('wem;kup bilet;wjedz na statek;wlm [Blekitna Wstega - Kreutzhofen]');
  });

  test('the carriageTeamTickets setting turns the expansion off', () => {
    characterStorage.set('settings', { carriageTeamTickets: false } as any);
    client.carriageMode = true;
    client.teammates = [{ num: 111 }];
    dockAndSight();
    expect(client.transportBind.label).toBe('wem;kup bilet;wjedz na statek;wlm [Blekitna Wstega - Kreutzhofen]');
  });

  test('the commands are recomputed when the bind is pressed', () => {
    client.carriageMode = true;
    dockAndSight();
    // A teammate arrives after the bind was set - the press must still buy their ticket.
    client.teammates = [{ num: 333 }];
    client.transportBind.callback!();
    expect(client.sendCommand.mock.calls.map(c => c[0])).toEqual([
      'wem',
      'kup bilet',
      'kup bilet',
      'daj bilet ob_333',
      'wjedz na statek',
      'wlm',
    ]);
  });
});

describe('transport journey as a wagon passenger', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;
  const onBoard = () => client.sendEvent.mock.calls.filter(c => c[0] === 'transport.onBoard').map(c => c[1]);

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initTransportTracker((client as unknown) as any);
    parse = (line: string, type = '') =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
  });

  test('a teammate driving aboard starts the journey without any board command', () => {
    client.sendEvent('enterLocation', { id: 6429 });
    parse('Wraz z Vesper, silnym zmeczonym mezczyzna, Chorem i Pablem wjezdzasz elegancka drewniana bryczka na poklad wielkiej galery.');
    expect(onBoard()).toEqual([true]);

    parse('Wraz z Pablem, Chorem, silnym zmeczonym mezczyzna i Vesper zjezdzasz elegancka drewniana bryczka na brzeg.');
    expect(onBoard()).toEqual([true, false]);
  });

  test('driving aboard away from any dock is ignored', () => {
    client.sendEvent('enterLocation', { id: 1 });
    parse('Wraz z Vesper wjezdzasz elegancka drewniana bryczka na poklad wielkiej galery.');
    expect(onBoard()).toEqual([]);
  });
});

describe('transport trigger events', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;
  const events = (name: string) => client.sendEvent.mock.calls.filter(c => c[0] === name).map(c => c[1]);
  const shout = (where: string) =>
    parse(`Ancelmus krzyczy: Doplynelismy do ${where}! Mozna wysiadac!`);

  // Board Ancelmus at Blekitna Wstega (6429) and sail: the first leg (43s) ends in Kraina Zgromadzenia.
  // The bell can only be rung once aboard - the popup has no route to click before that.
  const boardAndDepart = (bell?: string) => {
    client.sendEvent('enterLocation', { id: 6429 });
    client.sendEvent('command', 'wsiadz na statek');
    parse('Wchodzisz na wielka galere.');
    if (bell) client.sendEvent('transport.target', bell);
    setGmcp('room.info', {});
    parse('Galera odbija od brzegu.');
  };

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    setGmcp('room.info', {});
    client = new FakeClient();
    initTransportTracker((client as unknown) as any);
    parse = (line: string, type = '') =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('a stop on board fires transport.stop, but not transport.destination without a bell', () => {
    boardAndDepart();
    shout('przystani w Krainie Zgromadzenia');

    expect(events('transport.stop')).toEqual([
      { transport: 'Blekitna Wstega - Kreutzhofen', stop: 'Kraina Zgromadzenia' },
    ]);
    expect(events('transport.destination')).toEqual([]);
  });

  test('the bell destination fires transport.destination only at that stop', () => {
    boardAndDepart('Nuln');
    shout('przystani w Krainie Zgromadzenia');
    expect(events('transport.destination')).toEqual([]);

    parse('Galera odbija od brzegu.');
    shout('wschodniego nabrzeza w Nuln');
    expect(events('transport.destination')).toEqual([
      { transport: 'Blekitna Wstega - Kreutzhofen', stop: 'Nuln' },
    ]);
  });

  test('approaching fires once per leg when under the red threshold', () => {
    boardAndDepart('Kraina Zgromadzenia');

    jest.advanceTimersByTime(32_000);
    expect(events('transport.approaching')).toEqual([]);

    jest.advanceTimersByTime(2_000);
    expect(events('transport.approaching')).toEqual([
      { transport: 'Blekitna Wstega - Kreutzhofen', stop: 'Kraina Zgromadzenia', remaining: 10 },
    ]);
    expect(events('transport.approachingDestination')).toHaveLength(1);

    jest.advanceTimersByTime(8_000);
    expect(events('transport.approaching')).toHaveLength(1);
  });

  test('approachingDestination stays quiet on legs not ending at the bell', () => {
    boardAndDepart('Nuln');
    jest.advanceTimersByTime(40_000);
    expect(events('transport.approaching')).toHaveLength(1);
    expect(events('transport.approachingDestination')).toEqual([]);
  });

  test('the bell is forgotten when the journey ends', () => {
    boardAndDepart('Kraina Zgromadzenia');
    parse('Schodzisz z galery.');

    boardAndDepart();
    shout('przystani w Krainie Zgromadzenia');
    expect(events('transport.destination')).toEqual([]);
  });

  test('waiting at the dock, the ship pulling in fires transport.arrived', () => {
    setGmcp('room.info', { map: {} });
    client.sendEvent('enterLocation', { id: 6429 });
    shout('przystani na Blekitnej Wstedze');

    expect(events('transport.arrived')).toEqual([
      { transport: 'Blekitna Wstega - Kreutzhofen', stop: 'Blekitna Wstega' },
    ]);
    expect(events('transport.stop')).toEqual([]);
  });
});

describe('stagecoach direction at a mid-route village', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;
  const lastTimerLabel = () => {
    const timers = client.sendEvent.mock.calls.filter(c => c[0] === 'transportTimer');
    return timers[timers.length - 1]?.[1]?.label ?? null;
  };

  // Merceaux-Descloux (7744) is passed in both directions of the Quenelles - Parravon run,
  // and the coach pulls in with the same line whichever end it came from.
  const waitAtMerceaux = () => {
    setGmcp('room.info', { map: {} });
    client.sendEvent('enterLocation', { id: 7744 });
    parse('Woznica oznajmia gromkim glosem: Postoj, w wiosce Merceaux-Descloux.');
  };
  const boardAndDepart = () => {
    client.sendEvent('command', 'wsiadz do dylizansu');
    parse('Oplacasz podroz u woznicy i wsiadasz do blekitnego stojacego dylizansu.');
    setGmcp('room.info', {});
    parse('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
  };

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initTransportTracker((client as unknown) as any);
    parse = (line: string, type = '') =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('the driver announcing the next stop picks the leg', () => {
    waitAtMerceaux();
    parse('Woznica dylizansu glosno wola: Nastepny postoj - most pod Parravon!');
    boardAndDepart();
    expect(lastTimerLabel()).toBe('Merceaux-Descloux → Parravon');

    parse('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, plac przed zajazdem.');
    parse('Woznica wola: Nastepny postoj - Merceaux-Descloux!');
    expect(lastTimerLabel()).toBe('Parravon → Merceaux-Descloux');
  });

  test('without the announcement the arrival line does not guess a direction', () => {
    waitAtMerceaux();
    boardAndDepart();
    expect(lastTimerLabel()).toBeNull();
  });
});
