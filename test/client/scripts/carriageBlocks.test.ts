import initCarriageBlocks from '@client/scripts/carriageBlocks';
import { EventEmitter } from 'events';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { globalStorage } from '@modules/core/storage';
import { getBlockedRooms, resetBlockedRoomsCache } from '@modules/data/carriageBlocks';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  aliases: { pattern: RegExp; callback: Function }[] = [];
  println = jest.fn();
  sendEvent = jest.fn((type: string, payload?: any) => this.emitter.emit(type, payload));
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  Map = {
    currentRoom: { id: 100 } as { id: number },
    tryGetMapReader: () => ({ getRoom: (id: number) => ({ name: `Pokoj ${id}`, area: 7 }) }),
    getAreaName: () => 'Scala',
  };
  run(command: string) {
    for (const alias of this.aliases) {
      const matches = command.match(alias.pattern);
      if (matches) {
        alias.callback(matches);
        return true;
      }
    }
    return false;
  }
  lastPrint() {
    const call = this.println.mock.calls.at(-1);
    return typeof call?.[0] === 'string' ? call[0] : call?.[0]?.text;
  }
}

describe('carriage blockades', () => {
  let client: FakeClient;

  beforeEach(() => {
    localStorage.clear();
    resetBlockedRoomsCache();
    client = new FakeClient();
    initCarriageBlocks((client as unknown) as any);
  });

  test('/wozblok toggles the current room', () => {
    expect(client.run('/wozblok')).toBe(true);
    expect([...getBlockedRooms()]).toEqual([100]);
    expect(client.lastPrint()).toContain('nie przejedzie');

    client.run('/wozblok');
    expect([...getBlockedRooms()]).toEqual([]);
    expect(client.lastPrint()).toContain('znowu przejedzie');
  });

  test('/wozblok accepts an explicit room number', () => {
    client.run('/wozblok 4321');
    expect([...getBlockedRooms()]).toEqual([4321]);
  });

  test('the set survives a reload and is shared across characters', () => {
    client.run('/wozblok 8');
    client.run('/wozblok 3');
    // Global, not character-scoped: a wagon fits or it does not, whoever drives.
    expect(globalStorage.get('carriage_blocked_rooms')).toEqual([3, 8]);

    resetBlockedRoomsCache();
    expect([...getBlockedRooms()].sort((a, b) => a - b)).toEqual([3, 8]);
  });

  test('/wozbloki lists them with a line that can be pasted back', () => {
    client.run('/wozblok 12');
    client.run('/wozblok 7');
    client.run('/wozbloki');
    const printed = client.lastPrint();
    expect(printed).toContain('Pokoj 7, Scala (7)');
    expect(printed).toContain('Pokoj 12, Scala (12)');
    expect(printed).toContain('/wozbloki+ 7,12');
  });

  test('/wozbloki+ imports a gathered list, /wozbloki- clears it', () => {
    client.run('/wozbloki+ 5, 6 7');
    expect([...getBlockedRooms()].sort((a, b) => a - b)).toEqual([5, 6, 7]);

    client.run('/wozbloki-');
    expect([...getBlockedRooms()]).toEqual([]);
  });

  test('/wozbloki+ rejects a line with no numbers in it', () => {
    client.run('/wozblok 9');
    client.run('/wozbloki+ nic tu nie ma');
    expect([...getBlockedRooms()]).toEqual([9]);
    expect(client.lastPrint()).toContain('Nie rozpoznano');
  });

  test('publishes marked rooms to the map, and keeps them in step', () => {
    const marks = () => {
      const call = [...client.sendEvent.mock.calls].reverse().find((c) => c[0] === 'mapCarriageBlocks');
      return call ? call[1] : undefined;
    };
    expect(marks()).toEqual([]);

    client.run('/wozblok 11');
    expect(marks()).toEqual([11]);

    client.run('/wozblok 4');
    expect(marks()).toEqual([4, 11]);

    client.run('/wozblok 11');
    expect(marks()).toEqual([4]);

    client.run('/wozbloki-');
    expect(marks()).toEqual([]);
  });

  test('re-publishes marks when the map asks for them', () => {
    client.run('/wozblok 77');
    client.sendEvent.mockClear();
    client.sendEvent('requestMapCarriageBlocks');
    const call = [...client.sendEvent.mock.calls].reverse().find((c) => c[0] === 'mapCarriageBlocks');
    expect(call?.[1]).toEqual([77]);
  });

  describe('learning from a refusal', () => {
    let parse: (line: string) => unknown;

    beforeEach(() => {
      client.Map.currentRoom = {
        id: 100,
        exits: { west: 55, north: 56 },
        specialExits: { latarnia: 77 },
      } as any;
      parse = (line: string) =>
        Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    });

    test('blocks the room the refused compass exit leads to, not the one we are in', () => {
      parse('Nie mozna jechac na zachod.');
      expect([...getBlockedRooms()]).toEqual([55]);
      expect(client.lastPrint()).toContain('Zapamietane');
    });

    test('learns it just as well off the prompt line', () => {
      parse('> Nie mozna jechac na zachod.');
      expect([...getBlockedRooms()]).toEqual([55]);
    });

    test('blocks the room behind a refused special exit', () => {
      parse('Nie mozna jechac na latarnia.');
      expect([...getBlockedRooms()]).toEqual([77]);
    });

    test('stays quiet when the room is already known to be barred', () => {
      parse('Nie mozna jechac na zachod.');
      client.println.mockClear();
      parse('Nie mozna jechac na zachod.');
      expect([...getBlockedRooms()]).toEqual([55]);
      expect(client.println).not.toHaveBeenCalled();
    });

    test('never learns the rooms that refuse a ride for other reasons', () => {
      client.Map.currentRoom = {
        id: 100,
        exits: { west: 1419, north: 1137, east: 5217, south: 5253 },
        specialExits: { latarnia: 5235 },
      } as any;
      for (const way of ['zachod', 'polnoc', 'wschod', 'poludnie', 'latarnia']) {
        parse(`Nie mozna jechac na ${way}.`);
      }
      expect([...getBlockedRooms()]).toEqual([]);
      expect(client.println).not.toHaveBeenCalled();

      // A deliberate mark is a statement, not a guess, so it still stands.
      client.run('/wozblok 1419');
      expect([...getBlockedRooms()]).toEqual([1419]);
    });

    test('does nothing when the map does not know that exit', () => {
      parse('Nie mozna jechac na poludnie.');
      expect([...getBlockedRooms()]).toEqual([]);
    });

    test('a learned block can be undone from the room behind it', () => {
      parse('Nie mozna jechac na zachod.');
      client.run('/wozblok 55');
      expect([...getBlockedRooms()]).toEqual([]);
    });

    test('the notice carries a link that undoes it', () => {
      parse('Nie mozna jechac na zachod.');
      expect([...getBlockedRooms()]).toEqual([55]);

      const buffer = client.println.mock.calls.at(-1)![0];
      expect(buffer.text).toContain('[ cofnij ]');
      const link = buffer
        .getSegments()
        .map((segment: any) => segment.state?.hyperlink)
        .find((hyperlink: any) => hyperlink?.onClick);
      expect(link).toBeDefined();

      link.onClick();
      expect([...getBlockedRooms()]).toEqual([]);
      expect(client.lastPrint()).toContain('znowu przejedzie');
    });
  });

  test('the dead-end notice no longer marks anything on its own', () => {
    client.Map.currentRoom = {
      id: 100,
      exits: { south: 50, north: 60, east: 61 },
    } as any;
    Triggers.prototype.parseLine.call(
      client.Triggers,
      new AnsiAwareBuffer('Nie ma tu zadnej drogi, ktora mozna by dalej jechac.'),
      ''
    );
    expect([...getBlockedRooms()]).toEqual([]);
  });

  test('explains a split journey when leading somewhere the wagon cannot reach', () => {
    client.sendEvent('carriageRoute', {
      transfer: 42,
      driveRooms: 6,
      walkRooms: 3,
      destinationBlocked: true,
    });
    const printed = client.lastPrint();
    expect(printed).toContain('Pokoj 42, Scala (42)');
    expect(printed).toContain('6 lok.');
    expect(printed).toContain('3 lok.');
  });

  test('says the wagon is no use when it cannot move at all', () => {
    client.sendEvent('carriageRoute', {
      transfer: 100,
      driveRooms: 0,
      walkRooms: 5,
      destinationBlocked: true,
    });
    expect(client.lastPrint()).toContain('woz sie tu nie przyda');
  });
});
