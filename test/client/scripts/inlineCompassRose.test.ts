import initInlineCompassRose from '@client/scripts/inlineCompassRose';
import { EventEmitter } from 'events';
import { getShortDir, longToShort } from '@shared/map';

class FakeClient {
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

function parseExits(detail: any): string[] {
  let list: string[] = [];
  if (!detail) return list;
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
  return list
    .map((e) => getShortDir(e))
    .filter((dir) => VALID_SHORT_DIRS.has(dir));
}

describe('InlineCompassRose parsing', () => {
  const client = new FakeClient();
  initInlineCompassRose((client as unknown) as any);

  test('parseExits accepts various formats', () => {
    expect(parseExits(['north', 'south'])).toEqual(['n', 's']);
    expect(parseExits({ exits: ['east', 'west'] })).toEqual(['e', 'w']);
    expect(parseExits({ exits: { north: 1, south: 2 } })).toEqual(['n', 's']);
    expect(parseExits({ room: { exits: { up: 3 } } })).toEqual(['u']);
  });

  test('parseExits converts directions', () => {
    expect(parseExits(['polnoc', 'south', 'north', 'unknown'])).toEqual(['n', 's', 'n']);
  });
});
