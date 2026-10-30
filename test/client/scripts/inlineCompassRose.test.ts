import initInlineCompassRose from '@client/scripts/inlineCompassRose';
import { EventEmitter } from 'events';
import { getShortDir, longToShort } from '@shared/map';
import { characterStorage } from '@modules/core/storage';
import { gmcp } from '@client/gmcp';

class FakeClient {
  private emitter = new EventEmitter();
  on(event: string, cb: (...args: any[]) => void) {
    this.emitter.on(event, cb);
  }
  off(event: string, cb: (...args: any[]) => void) {
    this.emitter.off(event, cb);
  }
  println = jest.fn();
  sendEvent = jest.fn();
}

const VALID_SHORT_DIRS = new Set(Object.values(longToShort));

function parseExits(detail: any): { standard: string[]; special: string[] } {
  let list: string[] = [];
  if (!detail) return { standard: [], special: [] };
  if (Array.isArray(detail)) {
    list = detail;
  } else if (Array.isArray(detail.exits)) {
    list = detail.exits;
  } else if (detail.exits && typeof detail.exits === "object") {
    list = Object.keys(detail.exits);
  } else if (detail.room && detail.room.exits) {
    const e = detail.room.exits;
    list = Array.isArray(e) ? e : Object.keys(e);
  }

  const standard: string[] = [];
  const special: string[] = [];

  list.forEach((exit) => {
    const shortDir = getShortDir(exit);
    if (VALID_SHORT_DIRS.has(shortDir)) {
      standard.push(shortDir);
    } else {
      special.push(exit);
    }
  });

  return { standard, special };
}

describe('InlineCompassRose parsing', () => {
  const client = new FakeClient();
  initInlineCompassRose((client as unknown) as any);

  test('parseExits accepts various formats', () => {
    expect(parseExits(['north', 'south'])).toEqual({ standard: ['n', 's'], special: [] });
    expect(parseExits({ exits: ['east', 'west'] })).toEqual({ standard: ['e', 'w'], special: [] });
    expect(parseExits({ exits: { north: 1, south: 2 } })).toEqual({ standard: ['n', 's'], special: [] });
    expect(parseExits({ room: { exits: { up: 3 } } })).toEqual({ standard: ['u'], special: [] });
  });

  test('parseExits converts directions', () => {
    expect(parseExits(['polnoc', 'south', 'north', 'unknown'])).toEqual({ standard: ['n', 's', 'n'], special: ['unknown'] });
  });

  test('parseExits separates standard and special exits', () => {
    expect(parseExits(['north', 'secret passage', 'east', 'wejscie'])).toEqual({
      standard: ['n', 'e'],
      special: ['secret passage', 'wejscie']
    });
  });

  test('parseExits handles multiple special exits', () => {
    expect(parseExits(['north', 'exit1', 'exit2', 'exit3', 'exit4', 'south'])).toEqual({
      standard: ['n', 's'],
      special: ['exit1', 'exit2', 'exit3', 'exit4']
    });
  });
});

describe('InlineCompassRose box modes', () => {

  class BoxClient extends FakeClient {
    sendEvent = jest.fn((event: string, payload?: any) => this.emit(event, payload));
    sendCommand = jest.fn();
    Map = { locationHistory: [] as number[], currentRoom: null as any };
    emit(event: string, payload?: any) {
      (this as any).emitter.emit(event, payload);
    }
  }

  const lastBox = (client: BoxClient) =>
    client.sendEvent.mock.calls.filter(([event]) => event === 'compassRose.box').at(-1)?.[1];

  beforeEach(() => {
    localStorage.clear();
    gmcp.room = { info: { exits: { north: 1, 'wschod': 2, 'w bramie': 3 } } };
  });

  test('the grid mode sends the open exits, and the UI can ask for them later', () => {
    characterStorage.set('settings', { inlineCompassRose: 2 });
    const client = new BoxClient();
    initInlineCompassRose(client as any);

    client.emit('gmcp_msg.room.exits');
    const box = lastBox(client);
    expect(box.view).toBe('grid');
    expect(box.exits).toEqual(expect.arrayContaining(['n']));
    expect(box.specialExits).toContain('w bramie');

    client.sendEvent.mockClear();
    client.emit('requestCompassRose');
    expect(lastBox(client)).toEqual(box);
  });

  test('the ASCII mode is its own view, and switching off hides the box', () => {
    characterStorage.set('settings', { inlineCompassRose: 4 });
    const client = new BoxClient();
    initInlineCompassRose(client as any);
    expect(lastBox(client).view).toBe('ascii');

    characterStorage.set('settings', { inlineCompassRose: 0 });
    expect(lastBox(client)).toEqual({ view: 'hidden', exits: [], backDirs: [], specialExits: [], backSpecialExits: [] });
  });
});
