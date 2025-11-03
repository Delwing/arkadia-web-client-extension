import initTransportStops from '@client/scripts/transportStops';
import Triggers from '@client/Triggers';
import type { TransportTimerPayload } from '@client/types/transport';
import * as transportStats from '@client/utils/transportStats';
import type { StoredTransportSegmentRecord } from '@client/utils/transportStats';

class FakeClient {
  Triggers: Triggers;
  Map = { setMapRoomById: jest.fn() } as any;
  sendEvent = jest.fn();
  private listeners: Record<string, Function[]> = {};

  constructor() {
    this.Triggers = new Triggers({} as unknown as any);
  }

  on(event: string, listener: Function) {
    (this.listeners[event] ||= []).push(listener);
    return () => {};
  }

  dispatchEvent(event: string, detail?: any) {
    (this.listeners[event] || []).forEach(listener => listener(detail));
  }

  addEventListener = this.on;
}

describe('transport stop triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(async () => {
    await transportStats.clearTransportStats();
    client = new FakeClient();
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('stop pattern does not register trigger', () => {
    initTransportStops(client as unknown as any);
    const line = 'Bjorn krzyczy: Doplynelismy do przystani na wyspie Mekan! Mozna wysiadac!';
    parse(line);
    expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
  });

  test('tracks Salignac - Nuln route from sample log', () => {
    initTransportStops(client as unknown as any);
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

  test('tracks Quenelles - Montlac - Merceaux-Descloux route from sample log', () => {
    initTransportStops(client as unknown as any);
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

    client.dispatchEvent('enterLocation', { id: 4659 });

    parseLine('Woznica oznajmia gromkim glosem: Postoj, plac Gillesa le Breton.');
    parseLine('Woznica dylizansu glosno wola: Nastepny postoj - Montlac!');
    emitCommand('wsiadz do dylizansu');
    parseLine('Oplacasz podroz u woznicy i wsiadasz do blekitnego stojacego dylizansu.');

    const lastEvent = () => events[events.length - 1];

    expect(lastEvent()).toMatchObject({ label: 'Quenelles → Montlac', remaining: null, total: null });

    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');

    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, centrum wioski Montlac.');
    expect(lastEvent()).toMatchObject({ label: 'Montlac → Merceaux-Descloux', remaining: null, total: null });

    parseLine('Woznica wola: Nastepny postoj - Merceaux-Descloux!');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, w wiosce Merceaux-Descloux.');
    expect(lastEvent()).toMatchObject({ label: 'Merceaux-Descloux → Parravon', remaining: null, total: null });

    parseLine('Woznica wola: Nastepny postoj - most pod Parravon!');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, plac przed zajazdem.');
    expect(lastEvent()).toMatchObject({ label: 'Parravon → Merceaux-Descloux', remaining: null, total: null });

    parseLine('Woznica wola: Nastepny postoj - Merceaux-Descloux!');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, w wiosce Merceaux-Descloux.');
    expect(lastEvent()).toMatchObject({ label: 'Merceaux-Descloux → Montlac', remaining: null, total: null });

    parseLine('Woznica wola: Nastepny postoj - Montlac!');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, centrum wioski Montlac.');
    expect(lastEvent()).toMatchObject({ label: 'Montlac → Quenelles', remaining: null, total: null });

    parseLine('Woznica wola: Nastepny postoj - Quenelles!');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, plac Gillesa le Breton.');
    expect(lastEvent()).toMatchObject({ label: 'Quenelles → Montlac', remaining: null, total: null });

    emitCommand('wyjscie');
    expect(lastEvent()).toBeNull();

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('records transport segment stats when a stop completes', async () => {
    initTransportStops(client as unknown as any);
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
    const matching = segments.find(segment => segment.toLabel.includes("'Pod piegowata elfka'"));
    expect(matching).toBeTruthy();
    const record = matching!;
    expect(record.transport).toBe('Salignac - Nuln');
    expect(typeof record.fromId).toBe('number');
    expect(typeof record.toId).toBe('number');
    expect(typeof record.fromLabel).toBe('string');
    expect(typeof record.expectedDuration).toBe('number');
    expect(typeof record.shortestDuration.duration).toBe('number');
    expect(typeof record.longestDuration.duration).toBe('number');
  });

  test('tracks Wyzima - Oxenfurt route with shared stop pattern', () => {
    initTransportStops(client as unknown as any);
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
    initTransportStops(client as unknown as any);
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
    initTransportStops(client as unknown as any);
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
    initTransportStops(client as unknown as any);
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
    initTransportStops(client as unknown as any);
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

  test('uses stored transport segment minimum duration when available', async () => {
    const storedDuration = 40;
    const record: StoredTransportSegmentRecord = {
      segmentKey: 'Salignac - Nuln::5200->4985',
      transport: 'Salignac - Nuln',
      fromId: 5200,
      toId: 4985,
      fromLabel: 'Kreutzhofen',
      toLabel: "'Pod piegowata elfka'",
      shortestDuration: { duration: storedDuration, startedAt: 0, endedAt: storedDuration },
      longestDuration: { duration: storedDuration + 5, startedAt: 0, endedAt: storedDuration + 5 },
      expectedDuration: 53,
      updatedAt: Date.now(),
    };

    jest.spyOn(transportStats, 'getAllTransportSegments').mockResolvedValue([record]);
    initTransportStops(client as unknown as any);

    await Promise.resolve();
    await Promise.resolve();

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

    const payload = events[events.length - 1] as TransportTimerPayload;
    expect(payload.label).toBe("Kreutzhofen → 'Pod piegowata elfka'");
    expect(payload.total).toBe(storedDuration);

    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
