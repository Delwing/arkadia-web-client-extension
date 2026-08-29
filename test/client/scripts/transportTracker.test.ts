import initTransportTracker from '@client/scripts/transportTracker';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  aliases: { pattern: RegExp; callback: Function }[] = [];
  carriageMode = false;
  println = jest.fn();
  sendCommand = jest.fn();
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
