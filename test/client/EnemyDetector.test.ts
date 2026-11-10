import { EventEmitter } from 'events';
import { EnemyDetector, NEVER_SEEN_SECONDS } from '@client/EnemyDetector';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from './helpers/testSettings';

const PEOPLE = [
  { name: 'Intia', description: 'wojowniczka', guild: 'CKN', isEnemy: false },
  { name: 'Eamon', description: 'wysoki mezczyzna', guild: 'CKN', isEnemy: false },
  { name: 'Zbojca', description: 'brudny zbir', guild: 'Brak', isEnemy: true },
  { name: 'Kumpel', description: 'wesoly elf', guild: 'Brak', isEnemy: false },
];

vi.mock('@modules/data/peopleLoader', () => ({
  subscribeMerged: (listener: (p: typeof PEOPLE) => void) => { listener(PEOPLE); return () => {}; },
  refresh: () => Promise.resolve(PEOPLE),
}));

type Obj = { num: number; desc?: string; __category?: string };

class FakeClient {
  emitter = new EventEmitter();
  objects: Obj[] = [];
  sendEvent = jest.fn();
  ObjectManager = { getObjectsOnLocation: () => this.objects };
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }
}

describe('EnemyDetector', () => {
  let client: FakeClient;
  let detector: EnemyDetector;
  let time: number;

  const update = async (objects: Obj[]) => {
    client.objects = objects;
    client.emitter.emit('parsedNums', { nums: objects.map(o => o.num) });
    client.emitter.emit('parsedObjects');
    await Promise.resolve();
  };
  const seen = () => client.sendEvent.mock.calls.filter(c => c[0] === 'enemy.seen').map(c => c[1]);

  beforeEach(() => {
    characterStorage.setCharacter('TestChar');
    setTestSettings({ enemyGuilds: ['CKN'] });
    client = new FakeClient();
    time = 1_000_000;
    detector = new EnemyDetector(client as any, () => time);
  });

  test('matches enemies by description or name, guild or individual mark', () => {
    expect(detector.isEnemy('Wojowniczka')).toBe(true);
    expect(detector.isEnemy('Eamon')).toBe(true);
    expect(detector.isEnemy('brudny zbir')).toBe(true);
    expect(detector.isEnemy('wesoly elf')).toBe(false);
    expect(detector.isEnemy(undefined)).toBe(false);
  });

  test('follows the enemy guilds setting', () => {
    setTestSettings({ enemyGuilds: [] });
    expect(detector.isEnemy('wojowniczka')).toBe(false);
    expect(detector.isEnemy('brudny zbir')).toBe(true);
  });

  test('a group coming into view is one event; staying in view fires nothing more', async () => {
    await update([{ num: 1, desc: 'Wojowniczka' }, { num: 2, desc: 'Brudny zbir' }, { num: 3, desc: 'Wesoly elf' }]);
    expect(seen()).toEqual([{
      enemies: [
        { num: 1, desc: 'Wojowniczka', name: 'Intia', guild: 'CKN', secondsAway: NEVER_SEEN_SECONDS, firstTime: true },
        { num: 2, desc: 'Brudny zbir', name: 'Zbojca', guild: 'Brak', secondsAway: NEVER_SEEN_SECONDS, firstTime: true },
      ],
      names: 'Intia, Zbojca', count: 2, secondsAway: NEVER_SEEN_SECONDS, firstTime: true,
    }]);

    time += 5000;
    await update([{ num: 1, desc: 'Wojowniczka' }, { num: 2, desc: 'Brudny zbir' }]);
    expect(seen()).toHaveLength(1);
  });

  test('a chase reports a short absence, a return after a while a long one', async () => {
    await update([{ num: 1, desc: 'Wojowniczka' }]);
    time += 10_000;
    await update([]); // she runs
    time += 2_000;
    await update([{ num: 1, desc: 'Wojowniczka' }]); // we follow
    expect(seen()[1]).toMatchObject({ names: 'Intia', secondsAway: 2, firstTime: false });

    await update([]);
    time += 90_000;
    await update([{ num: 7, desc: 'Wojowniczka' }]);
    expect(seen()[2]).toMatchObject({ secondsAway: 90, firstTime: false });
  });

  test('each enemy keeps their own time', async () => {
    await update([{ num: 1, desc: 'Wojowniczka' }, { num: 2, desc: 'Wysoki mezczyzna' }]);
    await update([{ num: 1, desc: 'Wojowniczka' }]); // Eamon leaves
    time += 120_000;
    await update([]); // Intia runs after two minutes in view
    time += 1_000;
    await update([{ num: 1, desc: 'Wojowniczka' }, { num: 2, desc: 'Wysoki mezczyzna' }]);
    const last = seen()[1];
    expect(last.enemies.map((e: any) => [e.name, e.secondsAway])).toEqual([['Intia', 1], ['Eamon', 121]]);
    expect(last).toMatchObject({ count: 2, secondsAway: 121, firstTime: false });
  });

  test('ignores the player object', async () => {
    await update([{ num: 1, desc: 'Intia', __category: 'player' }]);
    expect(seen()).toEqual([]);
  });

  test('nums and data in the same tick make one check', async () => {
    client.objects = [{ num: 1, desc: 'Wojowniczka' }];
    client.emitter.emit('parsedNums', { nums: [1] });
    client.emitter.emit('parsedObjects');
    client.emitter.emit('parsedObjects');
    await Promise.resolve();
    expect(seen()).toHaveLength(1);
  });
});
