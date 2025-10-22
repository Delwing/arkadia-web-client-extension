import initTransportStops from '../src/scripts/transportStops';
import Triggers from '../src/Triggers';
import type { TransportTimerPayload } from '../src/types/transport';

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

  beforeEach(() => {
    client = new FakeClient();
    initTransportStops(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.clearAllMocks();
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
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    expect(events[events.length - 1]).toMatchObject({ label: "Kreutzhofen → 'Pod piegowata elfka'", total: 53 });

    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, dziedziniec przed zajazdem \'Pod piegowata elfka\'.');
    expect(events[events.length - 1]).toBeNull();

    parseLine('Woznica wola: Nastepny postoj - Salignac La Rouge!');
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    expect(events[events.length - 1]).toMatchObject({ label: "'Pod piegowata elfka' → Salignac La Rouge", total: 12 });

    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, rynek miejski Salignac La Rouge.');
    expect(events[events.length - 1]).toBeNull();

    parseLine("Woznica wola: Nastepny postoj - Karczma 'Pod piegowata elfka'!");
    parseLine('Drzwiczki sie zamykaja, drzenie przebiega przez caly pojazd, ktory powoli rusza.');
    expect(events[events.length - 1]).toMatchObject({ label: "Salignac La Rouge → 'Pod piegowata elfka'", total: 11 });

    parseLine('Z zewnatrz dochodzi stlumiony glos woznicy: Postoj, dziedziniec przed zajazdem \'Pod piegowata elfka\'.');
    expect(events[events.length - 1]).toBeNull();

    emitCommand('wyjscie');
    expect(events[events.length - 1]).toBeNull();

    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
