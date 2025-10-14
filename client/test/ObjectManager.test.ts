import ObjectManager from '../src/ObjectManager';
import appEventBus from '../src/events/app-event-bus';

describe('ObjectManager', () => {
  let manager: ObjectManager;

  beforeEach(() => {
    appEventBus.clear();
    manager = new ObjectManager();
  });

  test('stores nums and data and returns objects', () => {
    appEventBus.emit('gmcp.objects.data', {
      '1': { desc: 'Goblin', hp: 5, attack_num: true, avatar_target: true },
    });
    appEventBus.emit('gmcp.objects.nums', ['1']);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 1, desc: 'Goblin', state: 5, attack_num: true, avatar_target: true, shortcut: '1' },
    ]);
  });

  test('supports nums property object', () => {
    appEventBus.emit('gmcp.objects.data', {
      '2': { desc: 'Orc', hp: 10 },
    });
    appEventBus.emit('gmcp.objects.nums', { nums: [2] });
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 2, desc: 'Orc', state: 10, attack_num: undefined, avatar_target: undefined, shortcut: '1' },
    ]);
  });

  test('includes player from char info and state', () => {
    appEventBus.emit('gmcp.char.info', { object_num: 99, name: 'Hero' });
    appEventBus.emit('gmcp.char.state', { hp: 50 });
    appEventBus.emit('gmcp.objects.nums', []);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 99, desc: 'Hero', state: 50, attack_num: undefined, avatar_target: undefined, shortcut: '@' },
    ]);
  });

  test('normalizes player name to title case', () => {
    appEventBus.emit('gmcp.char.info', { object_num: 1, name: 'hERO NAME' });
    appEventBus.emit('gmcp.char.state', { hp: 10 });
    appEventBus.emit('gmcp.objects.nums', []);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 1, desc: 'Hero Name', state: 10, attack_num: undefined, avatar_target: undefined, shortcut: '@' },
    ]);
  });

  test('sets avatar target flag', () => {
    appEventBus.emit('gmcp.objects.data', { '1': { desc: 'Ogre', avatar_target: true } });
    appEventBus.emit('gmcp.objects.nums', ['1']);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 1, desc: 'Ogre', state: undefined, attack_num: undefined, avatar_target: true, shortcut: '1' },
    ]);
  });

  test('sorts player, team, and rest with shortcuts', () => {
    appEventBus.emit('gmcp.char.info', { object_num: 100, name: 'Player' });
    appEventBus.emit('gmcp.char.state', { hp: 30 });
    appEventBus.emit('gmcp.objects.data', {
      '1': { desc: 'Goblin', hp: 10 },
      '2': { desc: 'Ally1', hp: 40, team: true },
      '3': { desc: 'Ally2', hp: 50, team: true },
      '4': { desc: 'Ogre', hp: 20 },
    });
    appEventBus.emit('gmcp.objects.nums', ['1', '2', '3', '4']);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 100, desc: 'Player', state: 30, attack_num: undefined, avatar_target: undefined, shortcut: '@' },
      { num: 2, desc: 'Ally1', state: 40, attack_num: undefined, avatar_target: undefined, shortcut: 'A' },
      { num: 3, desc: 'Ally2', state: 50, attack_num: undefined, avatar_target: undefined, shortcut: 'B' },
      { num: 1, desc: 'Goblin', state: 10, attack_num: undefined, avatar_target: undefined, shortcut: '1' },
      { num: 4, desc: 'Ogre', state: 20, attack_num: undefined, avatar_target: undefined, shortcut: '2' },
    ]);
  });

  test('places non-combat objects last with shortcuts starting at 50', () => {
    appEventBus.emit('gmcp.objects.data', {
      '1': { desc: 'Fighter', attack_num: true },
      '2': { desc: 'Rock' },
      '3': { desc: 'Tree' },
    });
    appEventBus.emit('gmcp.objects.nums', ['1', '2', '3']);
    expect(manager.getObjectsOnLocation()).toEqual([
      { num: 1, desc: 'Fighter', state: undefined, attack_num: true, avatar_target: undefined, shortcut: '1' },
      { num: 2, desc: 'Rock', state: undefined, attack_num: undefined, avatar_target: undefined, shortcut: '50' },
      { num: 3, desc: 'Tree', state: undefined, attack_num: undefined, avatar_target: undefined, shortcut: '51' },
    ]);
  });
});
