import initTransportStops from '../src/scripts/transportStops';
import Triggers from '../src/Triggers';
import type { TransportTimerPayload } from '../src/types/transport';
import * as transportStats from '../src/utils/transportStats';

class FakeClient {
  Triggers: Triggers;
  Map = { setMapRoomById: jest.fn() } as any;
  sendEvent = jest.fn();
  private listeners: Record<string, Function[]> = {};

  constructor() {
    this.Triggers = new Triggers({} as unknown as any);
  }

  addEventListener(event: string, listener: Function) {
    (this.listeners[event] ||= []).push(listener);
    return () => {};
  }

  dispatchEvent(event: string, detail?: any) {
    (this.listeners[event] || []).forEach(listener => listener({ detail }));
  }
}

describe('transport stop triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(async () => {
    await transportStats.clearTransportStats();
    client = new FakeClient();
    initTransportStops(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('stop pattern does not register trigger', () => {
    const line = 'Bjorn krzyczy: Doplynelismy do przystani na wyspie Mekan! Mozna wysiadac!';
    parse(line);
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
  });

  test('tracks Salignac - Nuln route from sample log', () => {
    jest.useFakeTimers();
    const events: (TransportTimerPayload | null)[] = [];
    client.sendEvent = jest.fn((type: string, payload: any) => {
      if (type === 'transportTimer') {
        events.push(payload);
      }
    });

    const parseLine = (line: string) => {
      parse(line);
    };

    const emitCommand = (command: string) => {
      client.dispatchEvent('command', command);
    };

    client.dispatchEvent('enterLocation', { id: 5200 });

    parseLine("Woznica dylizansu glosno wola: Nastepny postoj - Karczma 'Pod piegowata elfka'!");
    emitCommand('wsiadz do dylizansu');
    parseLine('Oplacasz podroz u woznicy i wsiadasz do zielonego stojacego dylizansu.');
    const lastEvent = () => events[events.length - 1];

    expect(lastEvent()).toMatchObject({ label: "Kreutzhofen → 'Pod piegowata elfka'", remaining: 53, total: 53 });

    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    let payload = lastEvent() as TransportTimerPayload;
    expect(payload.label).toBe("Kreutzhofen → 'Pod piegowata elfka'");
    expect(payload.total).toBe(53);

    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, dziedziniec przed zajazdem \'Pod piegowata elfka\'.');
    expect(lastEvent()).toMatchObject({ label: "'Pod piegowata elfka' → Salignac La Rouge", remaining: 12, total: 12 });

    parseLine('Woznica wola: Nastepny postoj - Salignac La Rouge!');
    expect(lastEvent()).toMatchObject({ label: "'Pod piegowata elfka' → Salignac La Rouge", remaining: 12, total: 12 });

    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    payload = lastEvent() as TransportTimerPayload;
    expect(payload.label).toBe("'Pod piegowata elfka' → Salignac La Rouge");
    expect(payload.total).toBe(12);

    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, rynek miejski Salignac La Rouge.');
    expect(lastEvent()).toMatchObject({ label: "Salignac La Rouge → 'Pod piegowata elfka'", remaining: 11, total: 11 });

    parseLine("Woznica wola: Nastepny postoj - Karczma 'Pod piegowata elfka'!");
    expect(lastEvent()).toMatchObject({ label: "Salignac La Rouge → 'Pod piegowata elfka'", remaining: 11, total: 11 });

    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    payload = lastEvent() as TransportTimerPayload;
    expect(payload.label).toBe("Salignac La Rouge → 'Pod piegowata elfka'");
    expect(payload.total).toBe(11);

    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, dziedziniec przed zajazdem \'Pod piegowata elfka\'.');
    expect(lastEvent()).toMatchObject({ label: "'Pod piegowata elfka' → Salignac La Rouge", remaining: 12, total: 12 });

    emitCommand('wyjscie');
    expect(lastEvent()).toBeNull();

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('records transport segment stats when a stop completes', async () => {
    client.dispatchEvent('enterLocation', { id: 5200 });

    const parseLine = (line: string) => {
      parse(line);
    };

    const emitCommand = (command: string) => {
      client.dispatchEvent('command', command);
    };

    parseLine("Woznica dylizansu glosno wola: Nastepny postoj - Karczma 'Pod piegowata elfka'!");
    emitCommand('wsiadz do dylizansu');
    parseLine('Oplacasz podroz u woznicy i wsiadasz do zielonego stojacego dylizansu.');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');

    parseLine("Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, dziedziniec przed zajazdem 'Pod piegowata elfka'.");
    await new Promise(resolve => setTimeout(resolve, 0));
    const segments = await transportStats.getAllTransportSegments();
    expect(segments.length).toBeGreaterThan(0);
    const latest = segments[segments.length - 1];
    expect(latest.transport).toBe('Salignac - Nuln');
    expect(typeof latest.fromId).toBe('number');
    expect(typeof latest.toId).toBe('number');
    expect(typeof latest.fromLabel).toBe('string');
    expect(latest.toLabel).toContain("'Pod piegowata elfka'");
    expect(typeof latest.expectedDuration).toBe('number');
    expect(typeof latest.duration).toBe('number');
  });

  test('tracks Wyzima - Oxenfurt route with shared stop pattern', () => {
    jest.useFakeTimers();
    const events: (TransportTimerPayload | null)[] = [];
    client.sendEvent = jest.fn((type: string, payload: any) => {
      if (type === 'transportTimer') {
        events.push(payload);
      }
    });

    const parseLine = (line: string) => {
      parse(line);
    };

    const emitCommand = (command: string) => {
      client.dispatchEvent('command', command);
    };

    client.dispatchEvent('enterLocation', { id: 746 });

    parseLine('Woznica oznajmia gromkim glosem: Postoj - plac w centrum Bialego Mostu. Nastepny przystanek - wies Anchor.');
    parseLine('Siedzacy na kozle woznica krzyczy: Wkrotce wyruszamy w kierunku stolicy Temerii - Wyzimy!');
    emitCommand('wsiadz do dylizansu');
    parseLine('Placisz woznicy i wspinasz sie na czarny stojacy dylizans.');

    let payload = events[events.length - 1] as TransportTimerPayload;
    expect(payload.label).toBe('Bialy Most → Anchor');
    expect(payload.total).toBe(23);

    parseLine('Woznica oznajmia odjazd.');
    payload = events[events.length - 1] as TransportTimerPayload;
    expect(payload.label).toBe('Bialy Most → Anchor');

    parseLine('Monotonne kolysanie ustaje w koncu i woz zatrzymuje sie.');
    payload = events[events.length - 1] as TransportTimerPayload;
    expect(payload.label).toBe('Anchor → Wyzima');
    expect(payload.total).toBe(18);

    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj - wies Anchor. Nastepny przystanek - Wyzima.');
    parseLine('Siedzacy na kozle woznica krzyczy: Wkrotce wyruszamy w kierunku stolicy Temerii - Wyzimy!');
    parseLine('Woznica oznajmia odjazd.');
    payload = events[events.length - 1] as TransportTimerPayload;
    expect(payload.label).toBe('Anchor → Wyzima');

    parseLine('Monotonne kolysanie ustaje w koncu i woz zatrzymuje sie.');
    payload = events[events.length - 1] as TransportTimerPayload;
    expect(payload.label).toBe('Wyzima → Anchor');
    expect(payload.total).toBe(19);

    emitCommand('wyjscie');
    expect(events[events.length - 1]).toBeNull();

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('outside set pattern selects pending slot with known location', () => {
    jest.useFakeTimers();
    const events: (TransportTimerPayload | null)[] = [];
    client.sendEvent = jest.fn((type: string, payload: any) => {
      if (type === 'transportTimer') {
        events.push(payload);
      }
    });

    const parseLine = (line: string) => {
      parse(line);
    };

    const emitCommand = (command: string) => {
      client.dispatchEvent('command', command);
    };

    client.dispatchEvent('enterLocation', { id: 746 });
    parseLine('Woznica oznajmia gromkim glosem: Postoj - plac w centrum Bialego Mostu. Nastepny przystanek - wies Anchor.');
    parseLine('Siedzacy na kozle woznica krzyczy glosno: Wkrotce wyruszamy w kierunku stolicy Temerii - Wyzimy!');
    emitCommand('wsiadz do dylizansu');
    parseLine('Placisz woznicy i wspinasz sie na czarny stojacy dylizans.');

    const payload = events[events.length - 1] as TransportTimerPayload;
    expect(payload.label).toBe('Bialy Most → Anchor');
    expect(payload.total).toBe(23);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('exit failure keeps active journey running', () => {
    jest.useFakeTimers();
    const events: (TransportTimerPayload | null)[] = [];
    client.sendEvent = jest.fn((type: string, payload: any) => {
      if (type === 'transportTimer') {
        events.push(payload);
      }
    });

    const parseLine = (line: string) => {
      parse(line);
    };

    const emitCommand = (command: string) => {
      client.dispatchEvent('command', command);
    };

    client.dispatchEvent('enterLocation', { id: 5200 });

    parseLine("Woznica dylizansu glosno wola: Nastepny postoj - Karczma 'Pod piegowata elfka'!");
    emitCommand('wsiadz do dylizansu');
    parseLine('Oplacasz podroz u woznicy i wsiadasz do zielonego stojacego dylizansu.');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');

    const lastActive = events[events.length - 1] as TransportTimerPayload;
    expect(lastActive).toBeTruthy();

    emitCommand('wyjscie');
    expect(events[events.length - 1]).toBeNull();

    parseLine('Wolisz nie probowac wysiasc z jadacego dylizansu.');
    const resumed = events[events.length - 1] as TransportTimerPayload;
    expect(resumed.label).toBe(lastActive.label);
    expect(resumed.total).toBe(lastActive.total);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('set pattern outside chooses stop based on location', () => {
    jest.useFakeTimers();
    const events: (TransportTimerPayload | null)[] = [];
    client.sendEvent = jest.fn((type: string, payload: any) => {
      if (type === 'transportTimer') {
        events.push(payload);
      }
    });

    const parseLine = (line: string) => {
      parse(line);
    };

    const emitCommand = (command: string) => {
      client.dispatchEvent('command', command);
    };

    client.dispatchEvent('enterLocation', { id: 6571 });
    parseLine('Woznica glosno wola: Za chwile ruszamy w kierunku Nuln!');

    emitCommand('wsiadz do dylizansu');
    parseLine('Oplacasz podroz u woznicy i wsiadasz do czarnego stojacego dylizansu.');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');

    const payload = events[events.length - 1] as TransportTimerPayload;
    expect(payload.label).toBe("Karczma 'Czarny Kon' → Blutdorf");

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('set pattern on board requires multiple candidates', () => {
    jest.useFakeTimers();
    const events: (TransportTimerPayload | null)[] = [];
    client.sendEvent = jest.fn((type: string, payload: any) => {
      if (type === 'transportTimer') {
        events.push(payload);
      }
    });

    const parseLine = (line: string) => {
      parse(line);
    };

    const emitCommand = (command: string) => {
      client.dispatchEvent('command', command);
    };

    client.dispatchEvent('enterLocation', { id: 5200 });
    emitCommand('wsiadz do dylizansu');
    parseLine('Oplacasz podroz u woznicy i wsiadasz do zielonego stojacego dylizansu.');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');

    parseLine('Woznica wola: Nastepny postoj - Nuln!');
    const targeted = events[events.length - 1] as TransportTimerPayload;
    expect(targeted.label).toBe('Kreutzhofen → Nuln');

    const eventsAfterFirstSet = events.length;

    parseLine('Woznica wola: Nastepny postoj - Nuln!');
    expect(events.length).toBe(eventsAfterFirstSet);
    expect(events[events.length - 1]).toBe(targeted);

    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
