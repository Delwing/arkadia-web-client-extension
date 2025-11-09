import ObjectManager from '@client/ObjectManager';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }
  off(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  emit(event: string, detail?: any) {
    this.emitter.emit(event, detail);
  }
  sendEvent(type: string, detail?: any) {
    this.emit(type, detail);
  }
}

describe('ObjectManager', () => {
  let client: FakeClient;
  let manager: ObjectManager;

  beforeEach(() => {
    client = new FakeClient();
    manager = new ObjectManager((client as unknown) as any);
  });

  test('stores nums and data and returns objects', () => {
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Goblin', hp: 5, attack_num: true, avatar_target: true },
    });
    client.sendEvent('gmcp.objects.nums', ['1']);
    const objects = manager.getObjectsOnLocation();
    expect(objects).toMatchObject([
      {
        num: 1,
        desc: 'Goblin',
        state: 5,
        attack_num: true,
        avatar_target: true,
        shortcut: '1',
        __category: 'rest',
      },
    ]);
  });

  test('supports nums property object', () => {
    client.sendEvent('gmcp.objects.data', {
      '2': { desc: 'Orc', hp: 10 },
    });
    client.sendEvent('gmcp.objects.nums', { nums: [2] });
    const objects = manager.getObjectsOnLocation();
    expect(objects).toMatchObject([
      {
        num: 2,
        desc: 'Orc',
        state: 10,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: '1',
        __category: 'rest-noncombat',
      },
    ]);
  });

  test('includes player from char info and state', () => {
    client.sendEvent('gmcp.char.info', { object_num: 99, name: 'Hero' });
    client.sendEvent('gmcp.char.state', { hp: 50 });
    client.sendEvent('gmcp.objects.nums', []);
    const objects = manager.getObjectsOnLocation();
    expect(objects).toMatchObject([
      {
        num: 99,
        desc: 'Hero',
        state: 50,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: '@',
        __category: 'player',
      },
    ]);
  });

  test('normalizes player name to title case', () => {
    client.sendEvent('gmcp.char.info', { object_num: 1, name: 'hERO NAME' });
   client.sendEvent('gmcp.char.state', { hp: 10 });
   client.sendEvent('gmcp.objects.nums', []);
    const objects = manager.getObjectsOnLocation();
    expect(objects).toMatchObject([
      {
        num: 1,
        desc: 'Hero Name',
        state: 10,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: '@',
        __category: 'player',
      },
    ]);
  });

  test('sets avatar target flag', () => {
    client.sendEvent('gmcp.objects.data', { '1': { desc: 'Ogre', avatar_target: true } });
    client.sendEvent('gmcp.objects.nums', ['1']);
    const objects = manager.getObjectsOnLocation();
    expect(objects).toMatchObject([
      {
        num: 1,
        desc: 'Ogre',
        state: undefined,
        attack_num: undefined,
        avatar_target: true,
        shortcut: '1',
        __category: 'rest-noncombat',
      },
    ]);
  });

  test('sorts player, team, and rest with shortcuts', () => {
    client.sendEvent('gmcp.char.info', { object_num: 100, name: 'Player' });
    client.sendEvent('gmcp.char.state', { hp: 30 });
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Goblin', hp: 10 },
      '2': { desc: 'Ally1', hp: 40, team: true },
      '3': { desc: 'Ally2', hp: 50, team: true },
      '4': { desc: 'Ogre', hp: 20 },
    });
    client.sendEvent('gmcp.objects.nums', ['1', '2', '3', '4']);
    const objects = manager.getObjectsOnLocation();
    expect(objects).toMatchObject([
      {
        num: 100,
        desc: 'Player',
        state: 30,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: '@',
        __category: 'player',
      },
      {
        num: 2,
        desc: 'Ally1',
        state: 40,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: 'A',
        __category: 'team',
      },
      {
        num: 3,
        desc: 'Ally2',
        state: 50,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: 'B',
        __category: 'team',
      },
      {
        num: 1,
        desc: 'Goblin',
        state: 10,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: '1',
        __category: 'rest-noncombat',
      },
      {
        num: 4,
        desc: 'Ogre',
        state: 20,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: '2',
        __category: 'rest-noncombat',
      },
    ]);
  });

  test('places non-combat objects last with shortcuts starting at 50', () => {
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Fighter', attack_num: true },
      '2': { desc: 'Rock' },
      '3': { desc: 'Tree' },
    });
    client.sendEvent('gmcp.objects.nums', ['1', '2', '3']);
    const objects = manager.getObjectsOnLocation();
    expect(objects).toMatchObject([
      {
        num: 1,
        desc: 'Fighter',
        state: undefined,
        attack_num: true,
        avatar_target: undefined,
        shortcut: '1',
        __category: 'rest',
      },
      {
        num: 2,
        desc: 'Rock',
        state: undefined,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: '50',
        __category: 'rest-noncombat',
      },
      {
        num: 3,
        desc: 'Tree',
        state: undefined,
        attack_num: undefined,
        avatar_target: undefined,
        shortcut: '51',
        __category: 'rest-noncombat',
      },
    ]);
  });

  test('sorts team members by shortcut regardless of order', () => {
    client.sendEvent('gmcp.char.info', { object_num: 100, name: 'Player' });
    client.sendEvent('gmcp.char.state', { hp: 30 });
    client.sendEvent('gmcp.objects.data', {
      '2': { desc: 'Ally1', hp: 40, team: true },
      '3': { desc: 'Ally2', hp: 50, team: true },
      '4': { desc: 'Ally3', hp: 60, team: true },
    });
    // First update: team members appear in order 2, 3, 4
    client.sendEvent('gmcp.objects.nums', ['2', '3', '4']);
    let objects = manager.getObjectsOnLocation();
    expect(objects).toMatchObject([
      { num: 100, shortcut: '@', __category: 'player' },
      { num: 2, desc: 'Ally1', shortcut: 'A', __category: 'team' },
      { num: 3, desc: 'Ally2', shortcut: 'B', __category: 'team' },
      { num: 4, desc: 'Ally3', shortcut: 'C', __category: 'team' },
    ]);

    // Second update: team members appear in reverse order 4, 3, 2
    // They should still be sorted by shortcut A, B, C
    client.sendEvent('gmcp.objects.nums', ['4', '3', '2']);
    objects = manager.getObjectsOnLocation();
    expect(objects).toMatchObject([
      { num: 100, shortcut: '@', __category: 'player' },
      { num: 2, desc: 'Ally1', shortcut: 'A', __category: 'team' },
      { num: 3, desc: 'Ally2', shortcut: 'B', __category: 'team' },
      { num: 4, desc: 'Ally3', shortcut: 'C', __category: 'team' },
    ]);
  });
});
