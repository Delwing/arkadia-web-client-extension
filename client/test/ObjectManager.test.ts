import ObjectManager from '../src/ObjectManager';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  addEventListener(event: string, cb: any) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }
  removeEventListener(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  sendEvent(type: string, detail?: any) {
    this.emitter.emit(type, { detail });
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
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 1, desc: 'Goblin', state: 5, attack_num: true, avatar_target: true, shortcut: '1' },
    ]);
  });

  test('supports nums property object', () => {
    client.sendEvent('gmcp.objects.data', {
      '2': { desc: 'Orc', hp: 10 },
    });
    client.sendEvent('gmcp.objects.nums', { nums: [2] });
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 2, desc: 'Orc', state: 10, attack_num: undefined, avatar_target: undefined, shortcut: '1' },
    ]);
  });

  test('includes player from char info and state', () => {
    client.sendEvent('gmcp.char.info', { object_num: 99, name: 'Hero' });
    client.sendEvent('gmcp.char.state', { hp: 50 });
    client.sendEvent('gmcp.objects.nums', []);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 99, desc: 'Hero', state: 50, attack_num: undefined, avatar_target: undefined, shortcut: '@' },
    ]);
  });

  test('normalizes player name to title case', () => {
    client.sendEvent('gmcp.char.info', { object_num: 1, name: 'hERO NAME' });
    client.sendEvent('gmcp.char.state', { hp: 10 });
    client.sendEvent('gmcp.objects.nums', []);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 1, desc: 'Hero Name', state: 10, attack_num: undefined, avatar_target: undefined, shortcut: '@' },
    ]);
  });

  test('sets avatar target flag', () => {
    client.sendEvent('gmcp.objects.data', { '1': { desc: 'Ogre', avatar_target: true } });
    client.sendEvent('gmcp.objects.nums', ['1']);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 1, desc: 'Ogre', state: undefined, attack_num: undefined, avatar_target: true, shortcut: '1' },
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
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 100, desc: 'Player', state: 30, attack_num: undefined, avatar_target: undefined, shortcut: '@' },
      { num: 2, desc: 'Ally1', state: 40, attack_num: undefined, avatar_target: undefined, shortcut: 'A' },
      { num: 3, desc: 'Ally2', state: 50, attack_num: undefined, avatar_target: undefined, shortcut: 'B' },
      { num: 1, desc: 'Goblin', state: 10, attack_num: undefined, avatar_target: undefined, shortcut: '1' },
      { num: 4, desc: 'Ogre', state: 20, attack_num: undefined, avatar_target: undefined, shortcut: '2' },
    ]);
  });

  test('places non-combat objects last with shortcuts starting at 50', () => {
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Fighter', attack_num: true },
      '2': { desc: 'Rock' },
      '3': { desc: 'Tree' },
    });
    client.sendEvent('gmcp.objects.nums', ['1', '2', '3']);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 1, desc: 'Fighter', state: undefined, attack_num: true, avatar_target: undefined, shortcut: '1' },
      { num: 2, desc: 'Rock', state: undefined, attack_num: undefined, avatar_target: undefined, shortcut: '50' },
      { num: 3, desc: 'Tree', state: undefined, attack_num: undefined, avatar_target: undefined, shortcut: '51' },
    ]);
  });
});
