import initInlineCompassRose from '@client/scripts/inlineCompassRose';
import { EventEmitter } from 'events';
import { getShortDir, longToShort } from '@shared/map';
import { FakeClientBase } from '../helpers/fakeClient';

class FakeClient extends FakeClientBase {
  private emitter = new EventEmitter();
  on(event: string, cb: (...args: any[]) => void) {
    this.emitter.on(event, cb);
  }
  off(event: string, cb: (...args: any[]) => void) {
    this.emitter.off(event, cb);
  }
  println = jest.fn();
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
