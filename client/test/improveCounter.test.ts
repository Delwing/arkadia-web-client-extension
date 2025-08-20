import { initImproveCounter } from '../src/scripts/improveCounter';
import { initKillCounter } from '../src/scripts/kill';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { colorString, findClosestColor } from '../src/Colors';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  TeamManager = { isInTeam: jest.fn() };
  prefix = (line: string, prefix: string) => prefix + line;
  print = jest.fn();
  println = jest.fn();
  port = { postMessage: jest.fn() } as any;

  addEventListener(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  removeEventListener(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  dispatch(event: string, detail: any) {
    this.emitter.emit(event, { detail });
  }
}

describe('improve counter', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let show: () => void;
  let showDaily: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new FakeClient();
    const killCounter = initKillCounter((client as unknown) as any, []);
    client.dispatch('storage', { key: 'kill_counter', value: {} });
    const improveAliases: { pattern: RegExp; callback: () => void }[] = [];
    initImproveCounter((client as unknown) as any, killCounter, improveAliases);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
    show = improveAliases[0].callback;
    showDaily = improveAliases[1].callback;
  });

  test('records state changes, prints notification and table', () => {
    client.dispatch('gmcp.char.info', { name: 'Hero' });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    parse('Poczyniles male postepy, od momentu kiedy wszedles do gry.');
    const orange = findClosestColor('#ffa500');
    const message = colorString('\tWlasnie wbiles postepy: male (czas: 0:30)', orange);
    expect(client.println).toHaveBeenCalledWith(message);
    show();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/1\. male/);
    expect(printed).toMatch(/czas 0:30/);
    expect(printed).toMatch(/zabici 1\/1/);
  });

  test('ignores poznawanie swiata messages', () => {
    client.dispatch('gmcp.char.info', { name: 'Hero' });
    parse(
      'Masz wrazenie, iz ostatnimi czasy poczyniles nieznaczne postepy w poznawaniu swiata.'
    );
    expect(client.println).not.toHaveBeenCalled();
  });

  test('shows daily totals per character and handles multiple niebotyczne', () => {
    client.dispatch('gmcp.char.info', { name: 'Hero' });
    parse('Poczyniles niebotyczne postepy, od momentu kiedy wszedles do gry.');
    parse('Poczyniles niebotyczne postepy, od momentu kiedy wszedles do gry.');
    parse('Poczyniles male postepy, od momentu kiedy wszedles do gry.');
    showDaily();
    let printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/niebotyczne x2 \+ male/);
    client.print.mockClear();
    client.dispatch('gmcp.char.info', { name: 'Other' });
    parse('Poczyniles male postepy, od momentu kiedy wszedles do gry.');
    showDaily();
    printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/male/);
    expect(printed).not.toMatch(/niebotyczne/);
  });
});
